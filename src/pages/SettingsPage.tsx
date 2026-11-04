import React, { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Store,
  Users,
  Shield,
  Terminal,
  RefreshCw,
  CheckCircle2,
  Database,
  Banknote,
  RotateCcw,
  Key,
  Plus,
  Minus,
  X,
  Search,
  Filter,
  Check,
  UserCheck,
  AlertCircle,
  HelpCircle,
  SlidersHorizontal,
  Printer,
  Lock,
  FileText,
  Radio,
  Wifi,
  Usb,
  Sparkles,
} from 'lucide-react';
import {
  Business,
  ConnectivitySnapshot,
  ConnectivityState,
  PermissionKey,
  PrinterDevice,
  ReceiptPrinterMode,
  Shop,
  ShopPrinterSettings,
  User,
} from '../types/pos';
import { PHASE_1_ARCHITECTURE_STATUS } from '../services/dataServiceContracts';
import {
  BASE_CURRENCY_CODE,
  canActorResetUserPassword,
  DEFAULT_DETECTED_PRINTERS,
  DEFAULT_SHOP_PRINTER_SETTINGS,
  formatCurrency,
  getCurrencyOptionByCode,
  getShopPrinterSettings,
  PERMISSION_CATALOGUE,
  ROLE_DEFAULT_PERMISSIONS,
  SUPPORTED_CURRENCIES,
} from '../utils/posCalculations';
import { UserPasswordModal } from '../components/common/UserPasswordModal';

interface SettingsPageProps {
  business: Business;
  activeShop: Shop;
  allUsers: User[];
  currentUser?: User;
  connectivity: ConnectivitySnapshot;
  onChangeConnectivityState: (state: ConnectivityState) => void;
  onUpdateShopSettings: (
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
  ) => void;
  onUpdateBusinessCurrency: (businessId: string, currencyCode: string) => void;
  onUpdateUserPermissions?: (
    userId: string,
    permissions: PermissionKey[]
  ) => void;
  onResetUserPassword?: (userId: string, newPassword: string) => void;
}

type SettingsTab =
  | 'business'
  | 'shop'
  | 'printer'
  | 'users'
  | 'permissions'
  | 'terminal'
  | 'sync';

export const SettingsPage: React.FC<SettingsPageProps> = ({
  business,
  activeShop,
  allUsers,
  currentUser,
  connectivity,
  onChangeConnectivityState,
  onUpdateShopSettings,
  onUpdateBusinessCurrency,
  onUpdateUserPermissions,
  onResetUserPassword,
}) => {
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(
    null
  );
  const draftStorageKey = `smartmind_settings_draft_${activeShop.id}`;
  const savedDraft = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        window.sessionStorage.removeItem(draftStorageKey);
        window.localStorage.removeItem(draftStorageKey);
        return null;
      }
      const raw =
        window.sessionStorage.getItem(draftStorageKey) ||
        window.localStorage.getItem(draftStorageKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftStorageKey]);

  const [activeTab, setActiveTab] = useState<SettingsTab>(
    savedDraft?.activeTab ?? 'business'
  );
  const [shopNameInput, setShopNameInput] = useState<string>(
    savedDraft?.shopNameInput ?? activeShop.name
  );
  const [shopPhoneInput, setShopPhoneInput] = useState<string>(
    savedDraft?.shopPhoneInput ?? activeShop.phone
  );
  const [shopTaxInput, setShopTaxInput] = useState<string>(
    savedDraft?.shopTaxInput ?? activeShop.taxRatePercent.toString()
  );
  const [shopFooterInput, setShopFooterInput] = useState<string>(
    savedDraft?.shopFooterInput ?? activeShop.receiptFooterNote
  );
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(
    business.currencyCode || BASE_CURRENCY_CODE
  );
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  // User Settings & Permission State
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [selectedUserForPermissions, setSelectedUserForPermissions] =
    useState<User | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<PermissionKey[]>(
    []
  );
  const [permissionSearchQuery, setPermissionSearchQuery] = useState<string>('');
  const [permissionScopeFilter, setPermissionScopeFilter] = useState<
    'all' | 'shop' | 'business'
  >('all');
  const scopedBusinessUsers = useMemo(
    () =>
      allUsers.filter(
        (u) =>
          u.businessId === business.id &&
          u.role !== 'platform_admin' &&
          (currentUser?.role === 'business_owner' || currentUser?.role === 'platform_admin'
            ? true
            : u.role !== 'business_owner')
      ),
    [allUsers, business.id, currentUser?.role]
  );
  const [quickAddUserId, setQuickAddUserId] = useState<string | null>(null);
  const [inspectorUserId, setInspectorUserId] = useState<string>(
    () => scopedBusinessUsers[0]?.id || ''
  );

  // Printer Settings State
  const [printerSettings, setPrinterSettings] = useState<ShopPrinterSettings>(
    () => getShopPrinterSettings(activeShop)
  );
  const [detectedPrinters, setDetectedPrinters] = useState<PrinterDevice[]>(
    () => DEFAULT_DETECTED_PRINTERS
  );
  const [isScanningPrinters, setIsScanningPrinters] = useState<boolean>(false);
  const [testPrintModalOpen, setTestPrintModalOpen] = useState<boolean>(false);
  const [testPrintCompleted, setTestPrintCompleted] = useState<boolean>(false);
  const [showAddCustomPrinterModal, setShowAddCustomPrinterModal] =
    useState<boolean>(false);
  const [customPrinterName, setCustomPrinterName] = useState<string>('');
  const [customPrinterIp, setCustomPrinterIp] = useState<string>('');
  const [customPrinterType, setCustomPrinterType] = useState<
    'thermal' | 'laser_inkjet'
  >('thermal');

  useEffect(() => {
    setPrinterSettings(getShopPrinterSettings(activeShop));
  }, [activeShop]);

  useEffect(() => {
    setSelectedCurrencyCode(business.currencyCode || BASE_CURRENCY_CODE);
  }, [business.currencyCode]);

  useEffect(() => {
    const serialized = JSON.stringify({
      activeTab,
      shopNameInput,
      shopPhoneInput,
      shopTaxInput,
      shopFooterInput,
    });
    try {
      window.sessionStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
    try {
      window.localStorage.setItem(draftStorageKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftStorageKey,
    activeTab,
    shopNameInput,
    shopPhoneInput,
    shopTaxInput,
    shopFooterInput,
  ]);

  const selectedCurrencyOption = getCurrencyOptionByCode(selectedCurrencyCode);
  const activeCurrencyOption = getCurrencyOptionByCode(business.currencyCode);
  const activeDefaultPrinter = useMemo(
    () =>
      detectedPrinters.find((p) => p.id === printerSettings.defaultPrinterId) ||
      detectedPrinters[0],
    [detectedPrinters, printerSettings.defaultPrinterId]
  );

  const handleSavePrinterSettings = (nextSettings?: ShopPrinterSettings) => {
    const settingsToPersist = nextSettings || printerSettings;
    setPrinterSettings(settingsToPersist);
    onUpdateShopSettings(activeShop.id, {
      printerSettings: settingsToPersist,
    });
    const targetPrinter =
      detectedPrinters.find((p) => p.id === settingsToPersist.defaultPrinterId) ||
      detectedPrinters[0];
    setSavedBanner(
      `Printer settings saved for ${activeShop.name}: Default printer set to "${targetPrinter.name}", Mode is ${settingsToPersist.receiptPrinterMode.toUpperCase()}, Receipt Reprint is ${settingsToPersist.allowReceiptReprint ? 'ENABLED' : 'DISABLED'}.`
    );
  };

  const handleSelectDefaultPrinter = (printerId: string) => {
    const targetPrinter = detectedPrinters.find((p) => p.id === printerId);
    const nextSettings: ShopPrinterSettings = {
      ...printerSettings,
      defaultPrinterId: printerId,
    };
    setPrinterSettings(nextSettings);
    onUpdateShopSettings(activeShop.id, {
      printerSettings: nextSettings,
    });
    setSavedBanner(
      `Default printer updated to "${targetPrinter?.name || printerId}" for ${activeShop.name}.`
    );
  };

  const handleSelectReceiptPrinterMode = (mode: ReceiptPrinterMode) => {
    const nextSettings: ShopPrinterSettings = {
      ...printerSettings,
      receiptPrinterMode: mode,
    };
    setPrinterSettings(nextSettings);
    onUpdateShopSettings(activeShop.id, {
      printerSettings: nextSettings,
    });
    setSavedBanner(
      `Receipt printer mode set to ${mode === 'thermal' ? `Thermal Roll (${nextSettings.thermalPaperWidth})` : 'A4 Full-Page Document'} for ${activeShop.name}.`
    );
  };

  const handleToggleReceiptReprint = (enabled: boolean) => {
    const nextSettings: ShopPrinterSettings = {
      ...printerSettings,
      allowReceiptReprint: enabled,
    };
    setPrinterSettings(nextSettings);
    onUpdateShopSettings(activeShop.id, {
      printerSettings: nextSettings,
    });
    setSavedBanner(
      `Receipt reprint ${enabled ? 'ENABLED (Reprints allowed with DUPLICATE watermark)' : 'DISABLED (Reprinting locked in Sales History)'} for ${activeShop.name}.`
    );
  };

  const handleRescanPrinters = () => {
    setIsScanningPrinters(true);
    setTimeout(() => {
      setIsScanningPrinters(false);
      setSavedBanner(
        `System spooler scan complete: ${detectedPrinters.length} hardware and network printers verified on terminal ${activeShop.terminalId}.`
      );
    }, 550);
  };

  const handleAddCustomPrinter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customPrinterName.trim()) return;
    const newId = `prn-custom-${Date.now()}`;
    const newDevice: PrinterDevice = {
      id: newId,
      name: customPrinterName.trim(),
      driverName:
        customPrinterType === 'thermal'
          ? 'ESC/POS Network Raw Port 9100'
          : 'IPP / Network PCL6 Driver',
      type: customPrinterType,
      connection: customPrinterIp.trim() ? 'network' : 'usb',
      status: 'ready',
      paperFormats: customPrinterType === 'thermal' ? ['80mm', '58mm'] : ['a4'],
      ipAddress: customPrinterIp.trim() || undefined,
    };
    setDetectedPrinters((prev) => [...prev, newDevice]);
    const nextSettings: ShopPrinterSettings = {
      ...printerSettings,
      defaultPrinterId: newId,
      receiptPrinterMode: customPrinterType === 'thermal' ? 'thermal' : 'a4',
    };
    setPrinterSettings(nextSettings);
    onUpdateShopSettings(activeShop.id, {
      printerSettings: nextSettings,
    });
    setCustomPrinterName('');
    setCustomPrinterIp('');
    setShowAddCustomPrinterModal(false);
    setSavedBanner(
      `Added printer "${newDevice.name}" and selected it as the default printer.`
    );
  };

  const handleApplyCurrency = (codeToApply: string) => {
    const option = getCurrencyOptionByCode(codeToApply);
    setSelectedCurrencyCode(option.code);
    onUpdateBusinessCurrency(business.id, option.code);
    setSavedBanner(
      `Operating currency updated to ${option.name} (${option.code} — ${option.symbol.trim()}) across ${business.name}.`
    );
  };

  const handleSaveShopForm = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateShopSettings(activeShop.id, {
      name: shopNameInput.trim() || activeShop.name,
      phone: shopPhoneInput.trim() || activeShop.phone,
      taxRatePercent: parseFloat(shopTaxInput) || 0,
      receiptFooterNote: shopFooterInput.trim(),
    });
    const option = getCurrencyOptionByCode(selectedCurrencyCode);
    onUpdateBusinessCurrency(business.id, option.code);
    setSavedBanner(
      `Updated parameters for ${activeShop.code} and set currency to ${option.name} (${option.symbol.trim()}).`
    );
  };

  // Permission management actions
  const handleOpenPermissionEditor = (targetUser: User) => {
    setSelectedUserForPermissions(targetUser);
    setEditingPermissions([...targetUser.permissions]);
    setPermissionScopeFilter('all');
    setPermissionSearchQuery('');
  };

  const handleToggleEditingPermission = (key: PermissionKey) => {
    setEditingPermissions((prev) =>
      prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]
    );
  };

  const handleAddEditingPermission = (key: PermissionKey) => {
    if (!editingPermissions.includes(key)) {
      setEditingPermissions((prev) => [...prev, key]);
    }
  };

  const handleRemoveEditingPermission = (key: PermissionKey) => {
    setEditingPermissions((prev) => prev.filter((p) => p !== key));
  };

  const handleResetToRoleDefaults = () => {
    if (!selectedUserForPermissions) return;
    const defaults =
      ROLE_DEFAULT_PERMISSIONS[
        selectedUserForPermissions.role as keyof typeof ROLE_DEFAULT_PERMISSIONS
      ] || [];
    setEditingPermissions([...defaults]);
  };

  const handleGrantAllPermissions = () => {
    setEditingPermissions(PERMISSION_CATALOGUE.map((p) => p.key));
  };

  const handleClearAllPermissions = () => {
    setEditingPermissions([]);
  };

  const handleSaveUserPermissions = () => {
    if (!selectedUserForPermissions) return;
    if (onUpdateUserPermissions) {
      onUpdateUserPermissions(selectedUserForPermissions.id, editingPermissions);
    }
    setSavedBanner(
      `Permissions updated for ${selectedUserForPermissions.fullName}. Granted: ${editingPermissions.length} of ${PERMISSION_CATALOGUE.length} capabilities.`
    );
    setSelectedUserForPermissions(null);
  };

  const handleDirectAddPermission = (targetUser: User, key: PermissionKey) => {
    if (targetUser.permissions.includes(key)) return;
    const updated = [...targetUser.permissions, key];
    if (onUpdateUserPermissions) {
      onUpdateUserPermissions(targetUser.id, updated);
    }
    const permMeta = PERMISSION_CATALOGUE.find((p) => p.key === key);
    setSavedBanner(
      `Added permission "${permMeta?.label ?? key}" to ${targetUser.fullName}.`
    );
    setQuickAddUserId(null);
  };

  const handleDirectRemovePermission = (
    targetUser: User,
    key: PermissionKey
  ) => {
    const updated = targetUser.permissions.filter((p) => p !== key);
    if (onUpdateUserPermissions) {
      onUpdateUserPermissions(targetUser.id, updated);
    }
    const permMeta = PERMISSION_CATALOGUE.find((p) => p.key === key);
    setSavedBanner(
      `Removed permission "${permMeta?.label ?? key}" from ${targetUser.fullName}.`
    );
  };

  const filteredUsers = useMemo(() => {
    return scopedBusinessUsers.filter((u) => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!userSearchQuery.trim()) return true;
      const q = userSearchQuery.trim().toLowerCase();
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleLabel.toLowerCase().includes(q) ||
        u.assignedShopIds.some((s) => s.toLowerCase().includes(q)) ||
        u.permissions.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [scopedBusinessUsers, userRoleFilter, userSearchQuery]);

  const filteredCatalogPermissions = useMemo(() => {
    return PERMISSION_CATALOGUE.filter((p) => {
      if (
        permissionScopeFilter !== 'all' &&
        p.scope !== permissionScopeFilter
      ) {
        return false;
      }
      if (!permissionSearchQuery.trim()) return true;
      const q = permissionSearchQuery.trim().toLowerCase();
      return (
        p.label.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [permissionScopeFilter, permissionSearchQuery]);

  const TABS: {
    id: SettingsTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'business', label: 'Business & Currency', icon: Building2 },
    { id: 'shop', label: 'Shop Settings', icon: Store },
    { id: 'printer', label: 'Printer Settings', icon: Printer },
    { id: 'users', label: 'User Settings & Permissions', icon: Users },
    { id: 'permissions', label: 'Permissions Matrix', icon: Shield },
    { id: 'terminal', label: 'Terminal Settings', icon: Terminal },
    { id: 'sync', label: 'Synchronization Settings', icon: RefreshCw },
  ];

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 max-w-[1440px] mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left 3 Columns: Settings Sub-Navigation */}
        <aside className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-2 sm:p-3 flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 sm:gap-1.5 scrollbar-none">
          <div className="hidden lg:block px-3 py-2 border-b border-slate-100 mb-1">
            <p className="text-xs font-semibold text-slate-900">
              Configuration Modules
            </p>
            <p className="text-xs text-slate-500">
              Currency, Business &amp; Branch Controls
            </p>
          </div>
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSavedBanner(null);
                }}
                className={`whitespace-nowrap flex items-center gap-2 px-3 py-2 sm:py-2.5 rounded-lg text-xs font-semibold transition-colors text-left cursor-pointer shrink-0 min-h-[38px] ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Right 9 Columns: Settings Content Panel */}
        <div className="lg:col-span-9 bg-white rounded-xl border border-slate-200 p-4 sm:p-6 space-y-4 sm:space-y-6">
          {savedBanner && (
            <div
              role="status"
              className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{savedBanner}</span>
            </div>
          )}

          {/* 1. BUSINESS & CURRENCY SETTINGS */}
          {activeTab === 'business' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-display font-bold text-slate-900">
                    Business &amp; Currency Settings
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure operating currency (Base Currency: Nigerian Naira — ₦) and review owner account profile.
                  </p>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-emerald-600" />
                  <span>
                    Active Currency: {activeCurrencyOption.name} (
                    {activeCurrencyOption.code} · {activeCurrencyOption.symbol.trim()})
                  </span>
                </div>
              </div>

              {/* Currency Configuration Panel */}
              <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-display font-bold text-slate-900">
                        Operating Currency Configuration
                      </h3>
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[11px] font-mono font-semibold">
                        Base: NGN (₦)
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      Nigerian Naira (<span className="font-mono font-semibold">NGN — ₦</span>) is the platform base currency. Changing the currency updates price tags, POS billing, receipts, and financial reports immediately.
                    </p>
                  </div>

                  {business.currencyCode !== BASE_CURRENCY_CODE && (
                    <button
                      type="button"
                      onClick={() => handleApplyCurrency(BASE_CURRENCY_CODE)}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset to Base Currency (Naira ₦)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-5">
                    <label
                      htmlFor="business-currency-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Select Operating Currency
                    </label>
                    <select
                      id="business-currency-select"
                      value={selectedCurrencyCode}
                      onChange={(e) => handleApplyCurrency(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
                    >
                      {SUPPORTED_CURRENCIES.map((curr) => (
                        <option key={curr.code} value={curr.code}>
                          {curr.name} ({curr.code} — {curr.symbol.trim()})
                          {curr.isBaseCurrency ? ' [Base Currency]' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-4 px-3.5 py-2 rounded-lg bg-white border border-slate-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block text-[11px] text-slate-500 whitespace-nowrap">
                        Format Preview
                      </span>
                      <span className="text-sm font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                        {formatCurrency(25450, selectedCurrencyOption.symbol)}
                      </span>
                    </div>
                    <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 font-mono text-xs font-bold text-emerald-800 whitespace-nowrap shrink-0">
                      {selectedCurrencyOption.code} ({selectedCurrencyOption.symbol.trim()})
                    </span>
                  </div>

                  <div className="md:col-span-3">
                    <button
                      type="button"
                      onClick={() => handleApplyCurrency(selectedCurrencyCode)}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Save Currency
                    </button>
                  </div>
                </div>
              </div>

              {/* Business Profile Readout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Unique Business ID</span>
                  <p className="font-mono font-bold text-slate-900">
                    {business.id}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Business Name</span>
                  <p className="font-bold text-slate-900">{business.name}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Business Owner Account</span>
                  <p className="font-semibold text-slate-900">
                    {business.ownerName} ({business.ownerEmail})
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Registration &amp; Tax ID</span>
                  <p className="font-mono text-slate-800">
                    {business.registrationNumber} · {business.taxIdentificationNumber}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1 md:col-span-2">
                  <span className="text-slate-500">Headquarters Address</span>
                  <p className="text-slate-800">{business.headquartersAddress}</p>
                </div>
              </div>
            </div>
          )}

          {/* 2. SHOP SETTINGS */}
          {activeTab === 'shop' && (
            <form onSubmit={handleSaveShopForm} className="space-y-4 text-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-display font-bold text-slate-900">
                  Shop Settings — {activeShop.name} ({activeShop.code})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure parameters isolated to Shop ID: {activeShop.id}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="set-shop-name"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Branch Name
                  </label>
                  <input
                    id="set-shop-name"
                    type="text"
                    value={shopNameInput}
                    onChange={(e) => setShopNameInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-shop-phone"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Contact Phone
                  </label>
                  <input
                    id="set-shop-phone"
                    type="text"
                    value={shopPhoneInput}
                    onChange={(e) => setShopPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-shop-tax"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop VAT / Tax Rate (%)
                  </label>
                  <input
                    id="set-shop-tax"
                    type="number"
                    step="0.1"
                    value={shopTaxInput}
                    onChange={(e) => setShopTaxInput(e.target.value)}
                    className="w-full px-3 py-2 font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-shop-currency"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Operating Currency (Base: Nigerian Naira — ₦)
                  </label>
                  <select
                    id="set-shop-currency"
                    value={selectedCurrencyCode}
                    onChange={(e) => handleApplyCurrency(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900 cursor-pointer"
                  >
                    {SUPPORTED_CURRENCIES.map((curr) => (
                      <option key={curr.code} value={curr.code}>
                        {curr.name} ({curr.code} — {curr.symbol.trim()})
                        {curr.isBaseCurrency ? ' [Base Currency]' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label
                    htmlFor="set-shop-footer"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Receipt Footer Note
                  </label>
                  <input
                    id="set-shop-footer"
                    type="text"
                    value={shopFooterInput}
                    onChange={(e) => setShopFooterInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {/* Linked Printer & Receipt Hardware Shortcut */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800 shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm">
                      Printer &amp; Receipt Mode Configuration
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Default Printer:{' '}
                      <span className="font-semibold text-slate-800">
                        {activeDefaultPrinter?.name}
                      </span>{' '}
                      · Mode:{' '}
                      <span className="font-semibold uppercase text-slate-800">
                        {printerSettings.receiptPrinterMode === 'thermal'
                          ? `Thermal (${printerSettings.thermalPaperWidth})`
                          : 'A4 Sheet'}
                      </span>{' '}
                      · Receipt Reprint:{' '}
                      <span
                        className={`font-semibold ${
                          printerSettings.allowReceiptReprint
                            ? 'text-emerald-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {printerSettings.allowReceiptReprint
                          ? 'Enabled'
                          : 'Disabled'}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('printer')}
                  className="px-3.5 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 font-semibold text-slate-700 text-xs shrink-0 cursor-pointer flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Open Printer Settings</span>
                </button>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg cursor-pointer"
                >
                  Save Shop Parameters (Demo)
                </button>
                {business.currencyCode !== BASE_CURRENCY_CODE && (
                  <button
                    type="button"
                    onClick={() => handleApplyCurrency(BASE_CURRENCY_CODE)}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset to Base Currency (Naira ₦)</span>
                  </button>
                )}
              </div>
            </form>
          )}

          {/* 2B. PRINTER SETTINGS */}
          {activeTab === 'printer' && (
            <div className="space-y-6 text-xs">
              <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-display font-bold text-slate-900">
                      Printer Settings — {activeShop.name} ({activeShop.code})
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      {detectedPrinters.length} Installed Printers Detected
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Auto-detects installed system printers, sets your default output printer, configures Thermal or A4 receipt mode, and controls receipt reprint permissions.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRescanPrinters}
                    disabled={isScanningPrinters}
                    className="px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${
                        isScanningPrinters ? 'animate-spin text-emerald-600' : ''
                      }`}
                    />
                    <span>
                      {isScanningPrinters
                        ? 'Scanning System Spooler...'
                        : 'Rescan System Printers'}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTestPrintCompleted(false);
                      setTestPrintModalOpen(true);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Test Print Sample Receipt</span>
                  </button>
                </div>
              </div>

              {/* Active Hardware Summary Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-600 text-white shrink-0">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                      Active Default Printer
                    </span>
                    <p className="font-bold text-slate-900 truncate mt-0.5">
                      {activeDefaultPrinter?.name}
                    </p>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                      {activeDefaultPrinter?.connection.toUpperCase()} · Status: Ready
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-800 text-white shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                      Receipt Printer Mode
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {printerSettings.receiptPrinterMode === 'thermal'
                        ? `Thermal Printer (${printerSettings.thermalPaperWidth} Roll)`
                        : 'A4 Printer (Full Page Document)'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {printerSettings.receiptPrinterMode === 'thermal'
                        ? `Auto-Cut: ${printerSettings.autoCutReceipt ? 'On' : 'Off'} · Cash Drawer: ${printerSettings.openCashDrawerOnPrint ? 'On' : 'Off'}`
                        : 'Standard 210 × 297mm Full Tax Invoice'}
                    </p>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                    printerSettings.allowReceiptReprint
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-amber-50/70 border-amber-200'
                  }`}
                >
                  <div
                    className={`p-2 rounded-lg text-white shrink-0 ${
                      printerSettings.allowReceiptReprint
                        ? 'bg-emerald-600'
                        : 'bg-amber-600'
                    }`}
                  >
                    {printerSettings.allowReceiptReprint ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider block">
                      Receipt Reprint Policy
                    </span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {printerSettings.allowReceiptReprint
                        ? 'Receipt Reprint Enabled'
                        : 'Receipt Reprint Disabled'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {printerSettings.allowReceiptReprint
                        ? 'Watermarked duplicate slips allowed'
                        : 'Reprinting locked in Sales History'}
                    </p>
                  </div>
                </div>
              </div>

              {/* SECTION 1: AUTO-DETECTED SYSTEM PRINTERS & DEFAULT SELECTION */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-display font-bold text-slate-900">
                        1. Detected System Printers (Select Default Printer)
                      </h3>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                        <Radio className="w-3 h-3 text-emerald-600" />
                        <span>Auto-Detected on {activeShop.terminalId}</span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      All printers installed on this system (USB, Network LAN, and System Spooler) are listed below. Select which printer will serve as the default for POS checkout receipts.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddCustomPrinterModal(true)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold flex items-center gap-1.5 self-start sm:self-auto cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Network / Manual Printer</span>
                  </button>
                </div>

                {/* Dropdown selector for quick default selection */}
                <div className="p-3.5 rounded-lg bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label
                      htmlFor="default-printer-select"
                      className="block font-semibold text-slate-800 text-xs"
                    >
                      Quick Select Default System Printer
                    </label>
                    <span className="text-[11px] text-slate-500">
                      Automatically routes all POS checkout receipts and drawer triggers to this device
                    </span>
                  </div>
                  <select
                    id="default-printer-select"
                    value={printerSettings.defaultPrinterId}
                    onChange={(e) => handleSelectDefaultPrinter(e.target.value)}
                    className="sm:w-80 px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg font-semibold text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-600 cursor-pointer"
                  >
                    {detectedPrinters.map((prn) => (
                      <option key={prn.id} value={prn.id}>
                        {prn.name} [{prn.type === 'thermal' ? 'Thermal' : prn.type === 'laser_inkjet' ? 'A4 Office' : 'Virtual PDF'}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* Printer Device Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {detectedPrinters.map((prn) => {
                    const isDefault =
                      printerSettings.defaultPrinterId === prn.id;
                    return (
                      <div
                        key={prn.id}
                        onClick={() => handleSelectDefaultPrinter(prn.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                          isDefault
                            ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/15 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div
                              className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                                isDefault
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              <Printer className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-bold text-slate-900 truncate">
                                  {prn.name}
                                </p>
                                {isDefault && (
                                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider">
                                    Default Printer
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Driver: {prn.driverName || 'System Spooler Driver'}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px]">
                                  {prn.connection === 'network' ? (
                                    <Wifi className="w-3 h-3 text-slate-500" />
                                  ) : (
                                    <Usb className="w-3 h-3 text-slate-500" />
                                  )}
                                  <span className="uppercase">
                                    {prn.connection.replace('_', ' ')}
                                  </span>
                                  {prn.ipAddress ? ` (${prn.ipAddress})` : ''}
                                </span>
                                {prn.paperFormats.map((fmt) => (
                                  <span
                                    key={fmt}
                                    className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono uppercase text-[10px] font-semibold"
                                  >
                                    {fmt}
                                  </span>
                                ))}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                  <span className="capitalize">{prn.status}</span>
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectDefaultPrinter(prn.id);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer ${
                              isDefault
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }`}
                          >
                            {isDefault ? 'Default Selected' : 'Set as Default'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* SECTION 2: RECEIPT PRINTER MODE (THERMAL OR A4) */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    2. Receipt Printer Mode (Thermal vs A4 Printer)
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Choose how sales receipts are formatted and dispatched when completing sales or printing invoices.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Option A: Thermal Receipt Printer Mode */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectReceiptPrinterMode('thermal')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectReceiptPrinterMode('thermal');
                      }
                    }}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                      printerSettings.receiptPrinterMode === 'thermal'
                        ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/15 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-2 rounded-lg ${
                              printerSettings.receiptPrinterMode === 'thermal'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <Printer className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="font-display font-bold text-sm text-slate-900">
                              Thermal Printer Mode
                            </h4>
                            <span className="text-[11px] text-slate-500">
                              80mm / 58mm Continuous POS Roll (ESC/POS)
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            printerSettings.receiptPrinterMode === 'thermal'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {printerSettings.receiptPrinterMode === 'thermal'
                            ? 'Active Mode'
                            : 'Select Thermal'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        Optimized for high-speed retail checkout counters. Prints compact continuous slips with automatic paper cutter and RJ11/RJ12 cash drawer kick-out support.
                      </p>
                    </div>

                    {/* Thermal Sub-Options */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-3 border-t border-slate-100 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-700">
                          Thermal Roll Width:
                        </span>
                        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">
                          {(['80mm', '58mm'] as const).map((width) => (
                            <button
                              key={width}
                              type="button"
                              onClick={() => {
                                const next: ShopPrinterSettings = {
                                  ...printerSettings,
                                  receiptPrinterMode: 'thermal',
                                  thermalPaperWidth: width,
                                };
                                handleSavePrinterSettings(next);
                              }}
                              className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-bold cursor-pointer ${
                                printerSettings.thermalPaperWidth === width
                                  ? 'bg-slate-900 text-white'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {width}
                            </button>
                          ))}
                        </div>
                      </div>

                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-slate-700">
                          Auto-Cut Paper After Print
                        </span>
                        <input
                          type="checkbox"
                          checked={printerSettings.autoCutReceipt}
                          onChange={(e) => {
                            const next: ShopPrinterSettings = {
                              ...printerSettings,
                              autoCutReceipt: e.target.checked,
                            };
                            handleSavePrinterSettings(next);
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="text-slate-700">
                          Open Cash Drawer on Print
                        </span>
                        <input
                          type="checkbox"
                          checked={printerSettings.openCashDrawerOnPrint}
                          onChange={(e) => {
                            const next: ShopPrinterSettings = {
                              ...printerSettings,
                              openCashDrawerOnPrint: e.target.checked,
                            };
                            handleSavePrinterSettings(next);
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Option B: A4 Document Printer Mode */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelectReceiptPrinterMode('a4')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectReceiptPrinterMode('a4');
                      }
                    }}
                    className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-4 ${
                      printerSettings.receiptPrinterMode === 'a4'
                        ? 'bg-white border-emerald-600 ring-2 ring-emerald-600/15 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span
                            className={`p-2 rounded-lg ${
                              printerSettings.receiptPrinterMode === 'a4'
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                          </span>
                          <div>
                            <h4 className="font-display font-bold text-sm text-slate-900">
                              A4 Printer Mode
                            </h4>
                            <span className="text-[11px] text-slate-500">
                              Full-Sheet Standard Document (210 × 297mm)
                            </span>
                          </div>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            printerSettings.receiptPrinterMode === 'a4'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {printerSettings.receiptPrinterMode === 'a4'
                            ? 'Active Mode'
                            : 'Select A4 Mode'}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        Designed for wholesale depots, corporate supply orders, and pharmacies requiring formal full-page tax receipts with signature blocks on LaserJet or InkJet printers.
                      </p>
                    </div>

                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-3 border-t border-slate-100 space-y-2 text-slate-600"
                    >
                      <div className="flex items-center justify-between">
                        <span>Paper Size Standard:</span>
                        <span className="font-mono font-semibold text-slate-900">
                          ISO A4 (210 × 297 mm)
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Layout Style:</span>
                        <span className="font-semibold text-slate-900">
                          Full Letterhead + Tax Table + Signature Line
                        </span>
                      </div>
                      <label className="flex items-center justify-between gap-2 cursor-pointer pt-1">
                        <span className="text-slate-700">
                          Include Store Brand Header &amp; Tax ID
                        </span>
                        <input
                          type="checkbox"
                          checked={printerSettings.printStoreLogo}
                          onChange={(e) => {
                            const next: ShopPrinterSettings = {
                              ...printerSettings,
                              printStoreLogo: e.target.checked,
                            };
                            handleSavePrinterSettings(next);
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 cursor-pointer"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: ENABLE / DISABLE RECEIPT REPRINT */}
              <div className="p-4 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-display font-bold text-slate-900">
                        3. Receipt Reprint Control (Enable / Disable Reprint)
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                          printerSettings.allowReceiptReprint
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {printerSettings.allowReceiptReprint
                          ? 'Reprint Enabled'
                          : 'Reprint Disabled'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Control whether operators can reprint past sales receipts from the Sales History or POS checkout screen.
                    </p>
                  </div>

                  {/* Toggle Switch & Buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleReceiptReprint(true)}
                      className={`px-3.5 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                        printerSettings.allowReceiptReprint
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Enable Receipt Reprint</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleReceiptReprint(false)}
                      className={`px-3.5 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                        !printerSettings.allowReceiptReprint
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Disable Receipt Reprint</span>
                    </button>
                  </div>
                </div>

                {/* Explanation Callout */}
                {printerSettings.allowReceiptReprint ? (
                  <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Receipt Reprinting is Currently Enabled
                      </p>
                      <p className="text-slate-600">
                        Cashiers and managers can reprint historical sales receipts from the{' '}
                        <span className="font-semibold text-slate-800">Sales History</span>{' '}
                        module. All reprinted slips automatically carry a{' '}
                        <span className="font-mono font-semibold text-emerald-900">
                          *** DUPLICATE / REPRINT RECEIPT ***
                        </span>{' '}
                        watermark and timestamp for audit accountability.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        Receipt Reprinting is Currently Disabled (Strict Fraud Prevention)
                      </p>
                      <p className="text-amber-900/80">
                        Receipts can only be printed once at initial POS checkout. The{' '}
                        <span className="font-semibold">Reprint Receipt</span> button in{' '}
                        <span className="font-semibold">Sales History</span> is locked to prevent duplicate slips being used for unauthorized store exit clearance or fraudulent merchandise refunds.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Save Footer */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
                <p className="text-slate-500">
                  Changes apply immediately to <span className="font-semibold text-slate-800">{activeShop.name}</span> ({activeShop.terminalId}).
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      handleSavePrinterSettings(DEFAULT_SHOP_PRINTER_SETTINGS)
                    }
                    className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-semibold text-slate-700 cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Printer Defaults</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSavePrinterSettings()}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>Save Printer Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. USER MANAGEMENT & PERMISSIONS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-display font-bold text-slate-900">
                      User Settings &amp; Permission Control
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                      {scopedBusinessUsers.length} Operators
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Manage operator accounts, assign granular capabilities, or add and remove permissions per user.
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Fast Filter:</span>
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-medium border cursor-pointer transition-colors ${
                      userRoleFilter === 'all'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('shop_manager')}
                    className={`px-2.5 py-1 rounded-md font-medium border cursor-pointer transition-colors ${
                      userRoleFilter === 'shop_manager'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Managers
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserRoleFilter('cashier')}
                    className={`px-2.5 py-1 rounded-md font-medium border cursor-pointer transition-colors ${
                      userRoleFilter === 'cashier'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    Cashiers
                  </button>
                </div>
              </div>

              {/* Search & Role Filter Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 text-xs">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    placeholder="Search operators by name, email, role, or permissions..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
                  />
                  {userSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setUserSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <select
                    aria-label="Filter operators by role"
                    value={userRoleFilter}
                    onChange={(e) => setUserRoleFilter(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-emerald-600 cursor-pointer"
                  >
                    <option value="all">All Roles</option>
                    <option value="business_owner">Business Owner</option>
                    <option value="shop_manager">Shop Manager</option>
                    <option value="cashier">Shop Cashier</option>
                  </select>
                </div>
              </div>

              {/* Users Cards with Granular Permissions and Inline Add/Remove */}
              <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                {filteredUsers.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No operators match your filter criteria.
                  </div>
                ) : (
                  filteredUsers.map((u) => {
                    const isOwner = u.role === 'business_owner';
                    const unassignedPerms = PERMISSION_CATALOGUE.filter(
                      (p) => !u.permissions.includes(p.key)
                    );
                    const isQuickAddOpen = quickAddUserId === u.id;

                    return (
                      <div
                        key={u.id}
                        className="p-4 hover:bg-slate-50/60 transition-colors space-y-3"
                      >
                        {/* Top row: User name, role badge, status, manage button */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                              {u.fullName
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold text-xs text-slate-900">
                                  {u.fullName}
                                </p>
                                <span className="font-mono text-[11px] text-slate-500">
                                  ({u.email})
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                    isOwner
                                      ? 'bg-purple-100 text-purple-800'
                                      : u.role === 'shop_manager'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-emerald-100 text-emerald-800'
                                  }`}
                                >
                                  {u.roleLabel}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                                    u.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                                  }`}
                                >
                                  {u.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                Assigned:{' '}
                                {u.assignedShopIds.length > 0
                                  ? u.assignedShopIds.join(', ')
                                  : isOwner
                                  ? 'All Business Shops'
                                  : 'Unassigned'}
                              </p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {onResetUserPassword &&
                              currentUser &&
                              canActorResetUserPassword(currentUser, u) && (
                                <button
                                  type="button"
                                  onClick={() => setPasswordTargetUser(u)}
                                  className="px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Key className="w-3.5 h-3.5" />
                                  <span>
                                    {currentUser.id === u.id
                                      ? 'Change Password'
                                      : 'Reset Password'}
                                  </span>
                                </button>
                              )}
                            <button
                              type="button"
                              onClick={() => handleOpenPermissionEditor(u)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                            >
                              <Shield className="w-3.5 h-3.5" />
                              <span>Manage Permissions</span>
                            </button>
                          </div>
                        </div>

                        {/* Bottom row: Active Permissions pills with instant Remove ("x") and "+ Add Permission" button */}
                        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="text-[11px] font-semibold text-slate-600 mr-1 flex items-center gap-1">
                            <Key className="w-3 h-3 text-emerald-700" />
                            <span>
                              Permissions ({u.permissions.length} of{' '}
                              {PERMISSION_CATALOGUE.length}):
                            </span>
                          </span>

                          {u.permissions.length === 0 ? (
                            <span className="text-[11px] italic text-slate-400">
                              No permissions assigned
                            </span>
                          ) : (
                            u.permissions.map((permKey) => {
                              const permMeta = PERMISSION_CATALOGUE.find(
                                (p) => p.key === permKey
                              );
                              const label = permMeta?.label ?? permKey;
                              const isBusinessScope =
                                permMeta?.scope === 'business';

                              return (
                                <span
                                  key={permKey}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-colors ${
                                    isBusinessScope
                                      ? 'bg-indigo-50 border-indigo-200 text-indigo-900'
                                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                                  }`}
                                  title={permMeta?.description ?? permKey}
                                >
                                  <span>{label}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleDirectRemovePermission(u, permKey)
                                    }
                                    aria-label={`Remove ${label} permission from ${u.fullName}`}
                                    className="w-3.5 h-3.5 rounded-full hover:bg-red-200/80 hover:text-red-900 flex items-center justify-center text-slate-400 cursor-pointer transition-colors"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              );
                            })
                          )}

                          {/* Quick Add Permission Dropdown */}
                          {unassignedPerms.length > 0 && (
                            <div className="relative inline-block">
                              <button
                                type="button"
                                onClick={() =>
                                  setQuickAddUserId(
                                    isQuickAddOpen ? null : u.id
                                  )
                                }
                                aria-label={`Add permission to ${u.fullName}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-dashed border-emerald-300 bg-emerald-50/50 hover:bg-emerald-100/70 text-emerald-700 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Add Permission</span>
                              </button>

                              {isQuickAddOpen && (
                                <div className="absolute left-0 mt-1 z-30 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 text-xs max-h-60 overflow-y-auto">
                                  <div className="px-2 py-1 text-[11px] font-semibold text-slate-500 border-b border-slate-100 flex items-center justify-between">
                                    <span>Select Permission to Add</span>
                                    <button
                                      type="button"
                                      onClick={() => setQuickAddUserId(null)}
                                      className="text-slate-400 hover:text-slate-600"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                  <div className="divide-y divide-slate-50 pt-1">
                                    {unassignedPerms.map((perm) => (
                                      <button
                                        key={perm.key}
                                        type="button"
                                        onClick={() =>
                                          handleDirectAddPermission(u, perm.key)
                                        }
                                        className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg transition-colors flex items-center justify-between group cursor-pointer"
                                      >
                                        <div className="min-w-0 pr-2">
                                          <p className="font-semibold text-slate-900 truncate group-hover:text-emerald-900">
                                            {perm.label}
                                          </p>
                                          <p className="text-[10px] text-slate-500 truncate">
                                            {perm.description}
                                          </p>
                                        </div>
                                        <Plus className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 4. PERMISSIONS & RBAC MATRIX */}
          {activeTab === 'permissions' && (
            <div className="space-y-6">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-display font-bold text-slate-900">
                  Role-Based Access Control (RBAC) Matrix
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Defines shop-level vs business-level capabilities for Phase 2/3 enforcement.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs min-w-[580px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                      <th className="py-2.5 px-4 font-medium">Capability</th>
                      <th className="py-2.5 px-4 font-medium">Business Owner</th>
                      <th className="py-2.5 px-4 font-medium">Shop Manager</th>
                      <th className="py-2.5 px-4 font-medium">Shop Cashier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[
                      ['Access All Business Shops', 'Allowed', 'Assigned Shops Only', 'Assigned Shop Only'],
                      ['Operate Point of Sale', 'Allowed', 'Allowed', 'Allowed'],
                      ['Manage Invoices & Billing', 'Allowed', 'Allowed', 'Allowed'],
                      ['Add / Edit Shop Products & Prices', 'Allowed', 'Allowed', 'Restricted'],
                      ['Record Stock Adjustments', 'Allowed', 'Allowed', 'Restricted'],
                      ['Manage Debt Book', 'Allowed', 'Allowed', 'Restricted'],
                      ['View Multi-Shop Consolidated Reports', 'Allowed', 'Single Shop Only', 'Restricted'],
                      ['Manage Users & Sync Settings', 'Allowed', 'Restricted', 'Restricted'],
                    ].map(([cap, owner, mgr, cashier]) => (
                      <tr key={cap}>
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          {cap}
                        </td>
                        <td className="py-3 px-4 text-emerald-700 font-medium">
                          {owner}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{mgr}</td>
                        <td className="py-3 px-4 text-slate-600">{cashier}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* User Permissions Audit & Quick Editor in Permissions Tab */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-display font-bold text-slate-900">
                      Live Operator Capability Audit &amp; Permissions
                    </h3>
                    <p className="text-xs text-slate-500">
                      Select any operator to inspect their live permissions or add/remove permissions.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="inspect-user-select"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Operator:
                    </label>
                    <select
                      id="inspect-user-select"
                      value={inspectorUserId}
                      onChange={(e) => setInspectorUserId(e.target.value)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 cursor-pointer"
                    >
                      {scopedBusinessUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName} ({u.roleLabel})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {(() => {
                  const inspected =
                    scopedBusinessUsers.find((u) => u.id === inspectorUserId) ??
                    scopedBusinessUsers[0];
                  if (!inspected) return null;
                  return (
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900">
                            {inspected.fullName}
                          </span>
                          <span className="text-slate-500">
                            ({inspected.email})
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                            {inspected.roleLabel}
                          </span>
                          <span className="font-mono text-slate-500 text-[11px]">
                            {inspected.permissions.length} of{' '}
                            {PERMISSION_CATALOGUE.length} granted
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenPermissionEditor(inspected)}
                          className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          <span>Add / Remove Permissions</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {inspected.permissions.map((pKey) => {
                          const pMeta = PERMISSION_CATALOGUE.find(
                            (p) => p.key === pKey
                          );
                          return (
                            <span
                              key={pKey}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white border border-slate-200 text-slate-800"
                            >
                              <span>{pMeta?.label ?? pKey}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDirectRemovePermission(inspected, pKey)
                                }
                                title={`Remove ${pMeta?.label ?? pKey}`}
                                className="hover:text-red-600 text-slate-400 cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 5. TERMINAL & LOCAL DATABASE SETTINGS */}
          {activeTab === 'terminal' && (
            <div className="space-y-4 text-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-display font-bold text-slate-900">
                  Windows Desktop Terminal &amp; Persistent Local Database (Phase 5)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hardware peripherals, local persistent database engine, and future Electron + SQLite boundaries.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Assigned Terminal ID</span>
                  <p className="font-mono font-bold text-slate-900">
                    {activeShop.terminalId}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Current Storage Adapter</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                      IndexedDB (Browser Dev)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      sqlite-electron-desktop ready
                    </span>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Schema Version</span>
                  <p className="font-mono font-bold text-slate-900">
                    v5 (Minor-unit Integer Kobo Currency)
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                  <span className="text-slate-500">Desktop Packaging Target</span>
                  <p className="font-semibold text-slate-900">
                    Windows Desktop App (Electron + better-sqlite3)
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-1 md:col-span-2">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Target Local SQLite Database File Path</span>
                  </span>
                  <p className="font-mono text-slate-800 select-all">
                    C:\ProgramData\SmartMindPOS\data\{business.id}\{activeShop.id}\pos_local.sqlite3
                  </p>
                </div>
              </div>

              {/* Database Backup & Export Section */}
              <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900">Database Backup &amp; Offline Queue Export</h3>
                    <p className="text-[11px] text-slate-500">
                      Export a sanitized JSON snapshot of all products, stock movements, historical sales, and offline queue entries (passwords/tokens omitted).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const { getDatabaseAdapter } = await import('../db');
                        const { DatabaseBackupService } = await import('../services/databaseBackupService');
                        const adapter = getDatabaseAdapter();
                        const backupService = new DatabaseBackupService(adapter);
                        const backup = await backupService.exportBackup();
                        const blob = new Blob([JSON.stringify(backup, null, 2)], {
                          type: 'application/json',
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `smartmind-pos-backup-${activeShop.code}-${new Date().toISOString().slice(0, 10)}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        setSavedBanner('Database backup successfully exported.');
                      } catch (err: any) {
                        alert('Failed to generate database backup: ' + err.message);
                      }
                    }}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Database className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Download DB Backup (.json)</span>
                  </button>
                </div>
                <div className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                  <strong>SQLite Hot Backup Note:</strong> In the Electron desktop environment, live backups run via SQLite WAL mode non-blocking hot backup (<code>VACUUM INTO</code> or <code>better-sqlite3</code> backup API) while sales continue uninterrupted.
                </div>
              </div>
            </div>
          )}

          {/* 6. SYNCHRONIZATION SETTINGS */}
          {activeTab === 'sync' && (
            <div className="space-y-5 text-xs">
              <div className="border-b border-slate-100 pb-4">
                <h2 className="text-base font-display font-bold text-slate-900">
                  Offline Queue &amp; Cloud Synchronization Settings
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure how local SQLite transactions will sync with Firebase Cloud Services in Phase 3.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1">
                <p className="font-semibold">
                  Phase 1 Architectural Status: Prototype Simulation Mode
                </p>
                <p>
                  {PHASE_1_ARCHITECTURE_STATUS.localDatabase} ·{' '}
                  {PHASE_1_ARCHITECTURE_STATUS.cloudBackend}
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-800 mb-2">
                  Test Top-Bar Connectivity Status States:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      'online',
                      'offline',
                      'pending_sync',
                      'syncing',
                      'sync_error',
                    ] as ConnectivityState[]
                  ).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onChangeConnectivityState(st)}
                      className={`px-3 py-2 rounded-lg border font-semibold capitalize cursor-pointer ${
                        connectivity.state === st
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {st.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Permission Editor Modal */}
      {selectedUserForPermissions && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="perm-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="perm-modal-title"
                    className="text-sm font-display font-bold text-slate-900"
                  >
                    Manage Permissions — {selectedUserForPermissions.fullName}
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    {selectedUserForPermissions.roleLabel} ·{' '}
                    {selectedUserForPermissions.email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedUserForPermissions(null)}
                aria-label="Close permission editor"
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Toolbar */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-800">
                  Granted Capabilities:
                </span>
                <span className="px-2 py-0.5 rounded-full font-mono font-bold text-xs bg-emerald-100 text-emerald-800">
                  {editingPermissions.length} / {PERMISSION_CATALOGUE.length}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleGrantAllPermissions}
                  className="px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold cursor-pointer transition-colors"
                >
                  + Grant All (12)
                </button>
                <button
                  type="button"
                  onClick={handleResetToRoleDefaults}
                  className="px-2.5 py-1 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer transition-colors"
                >
                  Reset to Role Defaults
                </button>
                <button
                  type="button"
                  onClick={handleClearAllPermissions}
                  className="px-2.5 py-1 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold cursor-pointer transition-colors"
                >
                  Remove All
                </button>
              </div>
            </div>

            {/* Scope Filter & Search */}
            <div className="px-5 py-3 border-b border-slate-100 flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={permissionSearchQuery}
                  onChange={(e) => setPermissionSearchQuery(e.target.value)}
                  placeholder="Search capability by name, code, or description..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center gap-1.5">
                {(
                  [
                    ['all', 'All (12)'],
                    ['shop', 'Shop Scope (7)'],
                    ['business', 'Business Scope (5)'],
                  ] as const
                ).map(([sc, lbl]) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => setPermissionScopeFilter(sc)}
                    className={`px-2.5 py-1 rounded-md font-medium border whitespace-nowrap cursor-pointer transition-colors ${
                      permissionScopeFilter === sc
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable Capability Items */}
            <div className="p-5 overflow-y-auto space-y-2 flex-1">
              {filteredCatalogPermissions.map((perm) => {
                const isGranted = editingPermissions.includes(perm.key);
                const isBusinessScope = perm.scope === 'business';

                return (
                  <div
                    key={perm.key}
                    className={`p-3 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                      isGranted
                        ? 'bg-emerald-50/50 border-emerald-500 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <label className="flex items-start gap-3 flex-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isGranted}
                        onChange={() =>
                          handleToggleEditingPermission(perm.key)
                        }
                        className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 w-4 h-4 cursor-pointer"
                      />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-900 text-xs">
                            {perm.label}
                          </span>
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {perm.key}
                          </span>
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                              isBusinessScope
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isBusinessScope ? 'Business Scope' : 'Shop Scope'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                          {perm.description}
                        </p>
                      </div>
                    </label>

                    <div className="shrink-0 flex items-center gap-2 pt-0.5">
                      {isGranted ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleRemoveEditingPermission(perm.key)
                          }
                          className="px-2.5 py-1 rounded-md border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                          <span>Remove</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleAddEditingPermission(perm.key)
                          }
                          className="px-2.5 py-1 rounded-md border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Changes will apply to {selectedUserForPermissions.fullName}{' '}
                immediately.
              </p>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedUserForPermissions(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveUserPermissions}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  Save Permissions ({editingPermissions.length} Granted)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Network / Manual Printer Modal */}
      {showAddCustomPrinterModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Network or Manual Printer"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-900 text-white">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Add Network or USB Printer
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Register an additional printer on {activeShop.terminalId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCustomPrinterModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCustomPrinter} className="p-5 space-y-4">
              <div>
                <label
                  htmlFor="custom-prn-name"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Printer Model / Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="custom-prn-name"
                  type="text"
                  required
                  placeholder="e.g. Bixolon SRP-350III Thermal Counter 2"
                  value={customPrinterName}
                  onChange={(e) => setCustomPrinterName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label
                  htmlFor="custom-prn-type"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Printer Category
                </label>
                <select
                  id="custom-prn-type"
                  value={customPrinterType}
                  onChange={(e) =>
                    setCustomPrinterType(
                      e.target.value as 'thermal' | 'laser_inkjet'
                    )
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                >
                  <option value="thermal">
                    Thermal Receipt Printer (80mm / 58mm Roll)
                  </option>
                  <option value="laser_inkjet">
                    A4 Laser / InkJet Office Printer
                  </option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="custom-prn-ip"
                  className="block font-semibold text-slate-700 mb-1"
                >
                  Network IP Address (Optional — leave blank for USB)
                </label>
                <input
                  id="custom-prn-ip"
                  type="text"
                  placeholder="e.g. 192.168.1.210"
                  value={customPrinterIp}
                  onChange={(e) => setCustomPrinterIp(e.target.value)}
                  className="w-full px-3 py-2 font-mono border border-slate-300 rounded-lg"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddCustomPrinterModal(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  Add &amp; Set as Default
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Print Sample Receipt Modal */}
      {testPrintModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Test Print Diagnostic Preview"
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden text-xs">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-600 text-white">
                  <Printer className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-display font-bold text-slate-900">
                    Test Print Preview ({printerSettings.receiptPrinterMode.toUpperCase()} Mode)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Target Printer: {activeDefaultPrinter?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTestPrintModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto bg-slate-100 flex-1 flex justify-center">
              {printerSettings.receiptPrinterMode === 'thermal' ? (
                /* Thermal 80mm / 58mm Slip Preview */
                <div
                  className={`bg-white border border-slate-300 shadow-md p-4 font-mono text-[11px] space-y-2.5 ${
                    printerSettings.thermalPaperWidth === '58mm'
                      ? 'w-64'
                      : 'w-80'
                  }`}
                >
                  <div className="text-center border-b border-dashed border-slate-300 pb-2">
                    <p className="font-bold text-xs text-slate-900">
                      {activeShop.name}
                    </p>
                    <p className="text-slate-500">{activeShop.address}</p>
                    <p className="text-slate-500">Tel: {activeShop.phone}</p>
                    <p className="mt-1 px-2 py-0.5 bg-slate-900 text-white inline-block text-[10px] font-bold">
                      THERMAL {printerSettings.thermalPaperWidth.toUpperCase()} TEST SLIP
                    </p>
                  </div>

                  <div className="space-y-0.5 text-[10px] border-b border-dashed border-slate-300 pb-2">
                    <div className="flex justify-between">
                      <span>Printer:</span>
                      <span className="font-bold truncate max-w-[160px]">
                        {activeDefaultPrinter?.name}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Terminal:</span>
                      <span>{activeShop.terminalId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reprint Policy:</span>
                      <span className="font-bold">
                        {printerSettings.allowReceiptReprint
                          ? 'ALLOWED'
                          : 'DISABLED'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 border-b border-dashed border-slate-300 pb-2">
                    <div className="flex justify-between">
                      <span>1x Sample Retail Item A</span>
                      <span>
                        {formatCurrency(2500, activeCurrencyOption.symbol)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>2x Sample POS Item B</span>
                      <span>
                        {formatCurrency(3000, activeCurrencyOption.symbol)}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between font-bold text-xs pt-1">
                    <span>TOTAL:</span>
                    <span>
                      {formatCurrency(5500, activeCurrencyOption.symbol)}
                    </span>
                  </div>

                  <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-300">
                    <p>{activeShop.receiptFooterNote}</p>
                    {printerSettings.autoCutReceipt && (
                      <p className="mt-1 text-emerald-700 font-bold">
                        ✂ - - - [AUTO-CUT COMMAND ACTIVE] - - -
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* A4 Full Document Sheet Preview */
                <div className="bg-white border border-slate-300 shadow-md p-6 w-full space-y-4">
                  <div className="flex items-start justify-between border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="font-display font-bold text-sm text-slate-900">
                        {business.name} — {activeShop.name}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        {activeShop.address} · Tel: {activeShop.phone}
                      </p>
                      <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                        TIN: {business.taxIdentificationNumber} · RC:{' '}
                        {business.registrationNumber}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">
                        A4 FULL PAGE RECEIPT
                      </span>
                      <p className="font-mono text-[11px] text-slate-600 mt-1">
                        #TEST-A4-001
                      </p>
                    </div>
                  </div>

                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1.5">Description</th>
                        <th className="py-1.5 text-right">Qty</th>
                        <th className="py-1.5 text-right">Unit Price</th>
                        <th className="py-1.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="py-2 font-medium">
                          Sample Wholesale Carton Item
                        </td>
                        <td className="py-2 text-right font-mono">1</td>
                        <td className="py-2 text-right font-mono">
                          {formatCurrency(2500, activeCurrencyOption.symbol)}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {formatCurrency(2500, activeCurrencyOption.symbol)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 font-medium">
                          Sample Pharmacy / Store Pack
                        </td>
                        <td className="py-2 text-right font-mono">2</td>
                        <td className="py-2 text-right font-mono">
                          {formatCurrency(1500, activeCurrencyOption.symbol)}
                        </td>
                        <td className="py-2 text-right font-mono font-semibold">
                          {formatCurrency(3000, activeCurrencyOption.symbol)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className="border-t border-slate-200 pt-3 flex justify-between items-end">
                    <div className="text-[10px] text-slate-500 space-y-1">
                      <p>Default Printer: {activeDefaultPrinter?.name}</p>
                      <p>Customer Signature: _______________________</p>
                    </div>
                    <div className="text-right">
                      <span className="text-slate-500 text-[11px]">
                        Grand Total:
                      </span>
                      <p className="font-mono font-bold text-sm text-emerald-700">
                        {formatCurrency(5500, activeCurrencyOption.symbol)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {testPrintCompleted && (
              <div className="px-5 py-2.5 bg-emerald-50 border-t border-emerald-200 text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Test receipt dispatched to{' '}
                  <strong>{activeDefaultPrinter?.name}</strong> in{' '}
                  {printerSettings.receiptPrinterMode.toUpperCase()} format.
                </span>
              </div>
            )}

            <div className="px-5 py-3.5 border-t border-slate-200 bg-white flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setTestPrintModalOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-slate-700 cursor-pointer"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestPrintCompleted(true);
                  if (typeof window !== 'undefined' && window.print) {
                    try {
                      window.print();
                    } catch {
                      // Ignore print dialog cancellation
                    }
                  }
                }}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Send Test Job to Default Printer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordTargetUser && currentUser && onResetUserPassword && (
        <UserPasswordModal
          targetUser={passwordTargetUser}
          currentUser={currentUser}
          business={business}
          onClose={() => setPasswordTargetUser(null)}
          onSavePassword={(userId, newPwd) => {
            onResetUserPassword(userId, newPwd);
            setSavedBanner(
              `Updated password for "${passwordTargetUser.fullName}" (${passwordTargetUser.email}) under ${business.name}.`
            );
          }}
        />
      )}
    </div>
  );
};
