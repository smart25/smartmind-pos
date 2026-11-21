import React, { useState } from 'react';
import {
  Building2,
  MapPin,
  Store,
  ArrowRight,
  LogOut,
  ShieldCheck,
  AlertCircle,
  Terminal,
  Phone,
  UserCheck,
  Clock,
  Plus,
  CheckCircle2,
  X,
  Users,
  Key,
} from 'lucide-react';
import {
  AppView,
  Business,
  ConnectivitySnapshot,
  ConnectivityState,
  Shop,
  ShopCategory,
  User,
} from '../types/pos';
import {
  canActorResetUserPassword,
  CreateShopInput,
  getVisibleUsersForActor,
  hasPermission,
  validateShopRegistrationInput,
} from '../utils/posCalculations';
import { SMARTMIND_LOGO_IMAGE } from '../constants/branding';
import { ConnectivityStatusControl } from '../components/layout/ConnectivityStatusControl';
import { UserPasswordModal } from '../components/common/UserPasswordModal';

interface ShopSelectionPageProps {
  business: Business;
  currentUser: User;
  authorizedShops: Shop[];
  businessShops: Shop[];
  allShops: Shop[];
  activeShopId: string | null;
  onSelectShop: (shopId: string) => void;
  onCreateShop: (input: CreateShopInput) => Shop | Promise<Shop>;
  onOpenWorkspaceView?: (view: AppView, shopId?: string) => void;
  onSignOut: () => void;
  connectivity: ConnectivitySnapshot;
  onChangeConnectivityState: (state: ConnectivityState) => void;
  onSwitchDemoUser: (userId: string) => void;
  onResetUserPassword?: (userId: string, newPassword: string) => void;
  allDemoUsers: User[];
}

const SHOP_CATEGORIES: ShopCategory[] = [
  'Supermarket',
  'Pharmacy',
  'Express Mart',
  'Restaurant & Bakery',
  'Retail Store',
];

export const ShopSelectionPage: React.FC<ShopSelectionPageProps> = ({
  business,
  currentUser,
  authorizedShops,
  businessShops,
  allShops,
  activeShopId,
  onSelectShop,
  onCreateShop,
  onOpenWorkspaceView,
  onSignOut,
  connectivity,
  onChangeConnectivityState,
  onSwitchDemoUser,
  onResetUserPassword,
  allDemoUsers,
}) => {
  const canCreateShops =
    business.status === 'active' &&
    (currentUser.role === 'business_owner' ||
      hasPermission(currentUser, 'manage_shops'));

  const [selectedId, setSelectedId] = useState<string>(
    activeShopId && authorizedShops.some((s) => s.id === activeShopId)
      ? activeShopId
      : authorizedShops[0]?.id ?? ''
  );
  const [simulateEmptyState, setSimulateEmptyState] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(
    null
  );

  // Create Shop Modal State (persisted per business so refreshes never lose draft)
  const draftKey = `smartmind_shop_select_create_draft_${business.id}`;
  const savedDraft = React.useMemo(() => {
    if (typeof window === 'undefined') return null;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('reset') === '1') {
        window.sessionStorage.removeItem(draftKey);
        window.localStorage.removeItem(draftKey);
        return null;
      }
      const raw =
        window.sessionStorage.getItem(draftKey) ||
        window.localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [draftKey]);

  const [createModalOpen, setCreateModalOpen] = useState<boolean>(
    savedDraft?.createModalOpen ?? false
  );
  const [nameInput, setNameInput] = useState<string>(
    savedDraft?.nameInput ?? ''
  );
  const [categoryInput, setCategoryInput] = useState<ShopCategory>(
    savedDraft?.categoryInput ?? 'Supermarket'
  );
  const [phoneInput, setPhoneInput] = useState<string>(
    savedDraft?.phoneInput ?? business.primaryPhone ?? ''
  );
  const [addressInput, setAddressInput] = useState<string>(
    savedDraft?.addressInput ?? business.headquartersAddress ?? ''
  );
  const [cityInput, setCityInput] = useState<string>(
    savedDraft?.cityInput ?? 'Lagos'
  );
  const [descriptionInput, setDescriptionInput] = useState<string>(
    savedDraft?.descriptionInput ?? ''
  );
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    const serialized = JSON.stringify({
      createModalOpen,
      nameInput,
      categoryInput,
      phoneInput,
      addressInput,
      cityInput,
      descriptionInput,
    });
    try {
      window.sessionStorage.setItem(draftKey, serialized);
      window.localStorage.setItem(draftKey, serialized);
    } catch {
      // Ignore storage errors
    }
  }, [
    draftKey,
    createModalOpen,
    nameInput,
    categoryInput,
    phoneInput,
    addressInput,
    cityInput,
    descriptionInput,
  ]);

  const displayedShops = simulateEmptyState ? [] : authorizedShops;
  const effectiveSelectedId = displayedShops.some((s) => s.id === selectedId)
    ? selectedId
    : displayedShops[0]?.id ?? '';

  const handleContinue = (shopIdToOpen: string) => {
    if (!shopIdToOpen) return;
    onSelectShop(shopIdToOpen);
  };

  const openCreateShopModal = () => {
    setNameInput('');
    setCategoryInput('Supermarket');
    setPhoneInput(business.primaryPhone || '');
    setAddressInput(business.headquartersAddress || '');
    setCityInput('Lagos');
    setDescriptionInput('');
    setFormError(null);
    setCreateModalOpen(true);
  };

  const handleCreateShopSubmit = async (
    e: React.FormEvent,
    enterImmediately = false
  ) => {
    e.preventDefault();
    const payload: CreateShopInput = {
      name: nameInput,
      address: addressInput,
      locationCity: cityInput,
      phone: phoneInput,
      category: categoryInput,
      description: descriptionInput,
    };

    const validation = validateShopRegistrationInput(payload, businessShops);
    if (!validation.valid) {
      setFormError(validation.error ?? 'Please check the shop details.');
      return;
    }

    const created = await onCreateShop(payload);
    setCreateModalOpen(false);
    setSimulateEmptyState(false);
    setSelectedId(created.id);

    if (enterImmediately) {
      onSelectShop(created.id);
    } else {
      setFeedbackBanner(
        `Created shop "${created.name}" (${created.code} Â· ID: ${created.id}) under ${business.name}. Click "Enter Shop" to open its POS workspace.`
      );
    }
  };

  // Strictly isolate visible users: only business owners or users with manage_staff permission can see/switch other users
  const visibleBusinessUsers = React.useMemo(
    () => getVisibleUsersForActor(currentUser, allDemoUsers),
    [currentUser, allDemoUsers]
  );

  // Strict role authorization: Only the business owner (or platform admin) can switch accounts.
  // Shop managers and cashiers cannot switch into other users' accounts.
  const canSwitchUser =
    (currentUser.role === 'business_owner' ||
      currentUser.role === 'platform_admin') &&
    visibleBusinessUsers.length > 1;

  const formatUserRoleOption = (u: User) => {
    if (u.role === 'business_owner') {
      const count = businessShops.length;
      return `${u.fullName} â€” Owner (${count} shop${count === 1 ? '' : 's'})`;
    }
    return `${u.fullName} (${u.assignedShopIds.length} shop${
      u.assignedShopIds.length === 1 ? '' : 's'
    })`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Bar */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <img
            src={SMARTMIND_LOGO_IMAGE || './smartmind-logo.png'}
            onError={(e) => {
              const img = e.currentTarget;
              if (!img.dataset.retried) {
                img.dataset.retried = 'true';
                img.src = './smartmind-logo.png';
              }
            }}
            alt="SmartMind POS Logo"
            className="w-9 h-9 rounded-lg object-contain shrink-0"
          />
          <div className="min-w-0">
            <span className="font-display font-bold text-sm sm:text-base text-slate-900 truncate block">
              SmartMind POS
            </span>
            <span className="hidden sm:inline text-xs text-slate-500">
              Business &amp; Shop Workspace Selection
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <ConnectivityStatusControl
            snapshot={connectivity}
            onChangeState={onChangeConnectivityState}
          />
          <button
            type="button"
            onClick={onSignOut}
            className="flex items-center gap-1.5 px-3 py-1.5 min-h-[38px] sm:min-h-0 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden xs:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-8 space-y-4 sm:space-y-6">
        {/* Associated Business Card */}
        <section
          aria-label="Associated Business Profile"
          className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Associated Business Account</span>
                  <span aria-hidden="true">Â·</span>
                  <span className="font-mono text-slate-700">
                    ID: {business.id}
                  </span>
                  <span aria-hidden="true">Â·</span>
                  <span className="font-mono text-slate-700">
                    {business.registrationNumber}
                  </span>
                </div>
                <h1 className="text-xl lg:text-2xl font-display font-bold text-slate-900 mt-0.5">
                  {business.name}
                </h1>
                <p className="text-xs text-slate-500 mt-1">
                  {business.legalName} Â· {business.headquartersAddress}
                </p>
              </div>
            </div>

            {/* Signed-in Operator & Role Context */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                  <UserCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Signed in as: {currentUser.fullName}</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {currentUser.roleLabel} Â· Owner: {business.ownerName}
                </p>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 min-w-0 max-w-full">
                {canSwitchUser && (
                  <>
                    <label
                      htmlFor="switch-role-select"
                      className="text-xs text-slate-500 shrink-0"
                    >
                      Users in {business.name}:
                    </label>
                    <select
                      id="switch-role-select"
                      value={currentUser.id}
                      onChange={(e) => {
                        setSimulateEmptyState(false);
                        onSwitchDemoUser(e.target.value);
                      }}
                      className="text-xs bg-white border border-slate-300 rounded-md px-2 py-1.5 font-medium text-slate-800 focus:outline-none focus:border-emerald-600 max-w-full truncate"
                    >
                      {visibleBusinessUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {formatUserRoleOption(u)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {onResetUserPassword && (
                  <button
                    type="button"
                    onClick={() => setPasswordTargetUser(currentUser)}
                    className="px-2.5 py-1.5 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Key className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Change Password</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-700" />
                <span>
                  Shop Isolation Active: Products, prices, inventory &amp; sales
                  are strictly separated per shop.
                </span>
              </span>
            </div>
            {authorizedShops.length > 0 && (
              <button
                type="button"
                onClick={() => setSimulateEmptyState((prev) => !prev)}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
              >
                {simulateEmptyState
                  ? 'Restore Authorized Shops List'
                  : 'Preview "No Shops Assigned" Empty State'}
              </button>
            )}
          </div>
        </section>

        {feedbackBanner && (
          <div
            role="status"
            className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="font-medium">{feedbackBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedbackBanner(null)}
              className="text-emerald-700 hover:text-emerald-950 font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Shop Selection Section */}
        <section aria-label="Authorized Shops List" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-display font-bold text-slate-900">
                Select an Authorized Shop to Open
              </h2>
              <p className="text-xs text-slate-500">
                Showing {displayedShops.length} authorized shop
                {displayedShops.length === 1 ? '' : 's'} for{' '}
                {currentUser.fullName} under <strong>{business.name}</strong>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {canCreateShops && (
                <button
                  type="button"
                  onClick={openCreateShopModal}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 text-emerald-400" />
                  <span>Create New Shop in {business.name}</span>
                </button>
              )}

              {displayedShops.length > 0 && (
                <>
                  {canCreateShops && onOpenWorkspaceView && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenWorkspaceView('shops', effectiveSelectedId)
                      }
                      className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Store className="w-3.5 h-3.5 text-slate-500" />
                      <span>Shop Management</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleContinue(effectiveSelectedId)}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap"
                  >
                    <span>
                      Open Selected Shop (
                      {
                        displayedShops.find((s) => s.id === effectiveSelectedId)
                          ?.code
                      }
                      )
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </div>

          {displayedShops.length === 0 ? (
            /* Empty State when no shops exist yet, no shops are assigned, or business is suspended */
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center max-w-xl mx-auto my-6">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto ${
                  canCreateShops && !simulateEmptyState
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : 'bg-amber-50 border border-amber-200 text-amber-700'
                }`}
              >
                {canCreateShops && !simulateEmptyState ? (
                  <Store className="w-6 h-6" />
                ) : (
                  <AlertCircle className="w-6 h-6" />
                )}
              </div>

              <h3 className="text-base font-display font-bold text-slate-900 mt-4">
                {business.status === 'suspended'
                  ? 'Business Account Access Suspended'
                  : canCreateShops && !simulateEmptyState
                  ? `No Shops Created for ${business.name} Yet`
                  : 'No Shops Assigned to This Account'}
              </h3>

              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                {business.status === 'suspended' ? (
                  <>
                    Access for <strong>{business.name}</strong> (ID:{' '}
                    <code className="font-mono">{business.id}</code>) has been
                    suspended by the Platform Administrator. All historical
                    shops, inventory, and sales records remain preserved.
                  </>
                ) : canCreateShops && !simulateEmptyState ? (
                  <>
                    You are signed in as the Primary Business Owner (
                    <strong>{currentUser.fullName}</strong>) for{' '}
                    <strong>{business.name}</strong>. Create your first shop
                    branch below to initialize its independent POS workspace,
                    product catalogue, and staff assignments.
                  </>
                ) : (
                  <>
                    Your user profile (<strong>{currentUser.fullName}</strong>)
                    is registered under <strong>{business.name}</strong>, but
                    has not been granted access to any active shop branch yet.
                  </>
                )}
              </p>

              <p className="text-xs text-slate-500 mt-3">
                {business.status === 'suspended'
                  ? 'Switch to the Platform Administrator role to re-activate this business.'
                  : canCreateShops && !simulateEmptyState
                  ? `Each shop created under ${business.name} (${business.id}) receives its own isolated inventory, categories, units of measurement, and sales ledger.`
                  : `Please contact the Business Owner (${business.ownerName} Â· ${business.ownerEmail}) to assign your shop permissions.`}
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                {simulateEmptyState ? (
                  <button
                    type="button"
                    onClick={() => setSimulateEmptyState(false)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Return to Authorized Shops
                  </button>
                ) : canCreateShops ? (
                  <button
                    type="button"
                    onClick={openCreateShopModal}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create First Shop for {business.name}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSwitchDemoUser(business.ownerUserId)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Switch to {business.ownerName} ({businessShops.length} Shop
                    {businessShops.length === 1 ? '' : 's'})
                  </button>
                )}

                <button
                  type="button"
                  onClick={onSignOut}
                  className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Back to Login Screen
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {displayedShops.map((shop) => {
                const isSelected = effectiveSelectedId === shop.id;
                const statusLabel =
                  shop.status === 'active'
                    ? 'Active & Open'
                    : shop.status === 'maintenance'
                    ? 'Maintenance Mode'
                    : 'Closed';
                const statusColor =
                  shop.status === 'active'
                    ? 'text-emerald-700'
                    : shop.status === 'maintenance'
                    ? 'text-amber-700'
                    : 'text-slate-500';

                return (
                  <div
                    key={shop.id}
                    onClick={() => setSelectedId(shop.id)}
                    className={`bg-white rounded-xl border p-5 flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 ring-2 ring-emerald-600/15'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-mono font-semibold text-slate-700">
                          {shop.code} Â· {shop.category}
                        </span>
                        <span className={`font-semibold ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>

                      <h3 className="text-base font-display font-bold text-slate-900 mt-2">
                        {shop.name}
                      </h3>

                      <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            {shop.address}, {shop.locationCity}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono tabular-nums">
                            {shop.phone}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Terminal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Terminal:{' '}
                            <strong className="font-mono">
                              {shop.terminalId}
                            </strong>{' '}
                            Â· Manager: {shop.managerName}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Pending Sync Queue:{' '}
                            <strong className="font-mono tabular-nums">
                              {shop.pendingSyncCount} records
                            </strong>
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono text-slate-500">
                        ID: {shop.id}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleContinue(shop.id);
                        }}
                        className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        <span>Enter Shop</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Users Registered Under This Business Owner */}
        <section
          aria-label="Users Registered Under Business Owner"
          className="bg-white rounded-xl border border-slate-200 overflow-hidden"
        >
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-display font-bold text-slate-900">
                  Users Registered Under {business.name} ({visibleBusinessUsers.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Showing all accounts registered under <strong>{business.ownerName}</strong> ({business.name}). Other businesses on the platform are strictly isolated.
                </p>
              </div>
            </div>

            {onOpenWorkspaceView &&
              (currentUser.role === 'business_owner' ||
                hasPermission(currentUser, 'manage_staff')) &&
              effectiveSelectedId && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenWorkspaceView('staff', effectiveSelectedId)
                  }
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Manage Staff &amp; Permissions</span>
                </button>
              )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-4 font-semibold">Full Name &amp; Email</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Assigned Shops in {business.name}</th>
                  <th className="py-3 px-4 font-semibold">Password Status</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleBusinessUsers.map((u) => {
                  const assignedShopNames =
                    u.role === 'business_owner'
                      ? `All Shops (${businessShops.length})`
                      : businessShops
                          .filter((s) => u.assignedShopIds.includes(s.id))
                          .map((s) => s.name)
                          .join(', ') || 'No shops assigned';
                  const canResetPwd =
                    Boolean(onResetUserPassword) &&
                    canActorResetUserPassword(currentUser, u);
                  return (
                    <tr
                      key={u.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <p className="font-semibold text-slate-900">
                          {u.fullName}
                        </p>
                        <p className="font-mono text-slate-500 text-[11px]">
                          {u.email}
                        </p>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded font-semibold text-[11px] ${
                            u.role === 'business_owner'
                              ? 'bg-emerald-100 text-emerald-900'
                              : u.role === 'shop_manager'
                              ? 'bg-blue-50 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role === 'business_owner'
                            ? 'Business Owner'
                            : u.role === 'shop_manager'
                            ? 'Shop Manager'
                            : 'Cashier'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {assignedShopNames}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {u.password ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                            <Key className="w-3 h-3 text-emerald-600" />
                            <span>Custom Set</span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-slate-500">
                            Default Password
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold capitalize ${
                            u.status === 'active'
                              ? 'text-emerald-700'
                              : 'text-red-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              u.status === 'active'
                                ? 'bg-emerald-600'
                                : 'bg-red-600'
                            }`}
                          />
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canResetPwd && (
                            <button
                              type="button"
                              onClick={() => setPasswordTargetUser(u)}
                              aria-label={`${
                                u.id === currentUser.id
                                  ? 'Change password'
                                  : 'Reset password'
                              } for ${u.fullName}`}
                              className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Key className="w-3 h-3" />
                              <span>
                                {u.id === currentUser.id
                                  ? 'Change Password'
                                  : 'Reset Password'}
                              </span>
                            </button>
                          )}
                          {u.id === currentUser.id ? (
                            <span className="text-[11px] font-mono text-emerald-700 font-semibold px-1.5">
                              Active User
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSwitchDemoUser(u.id)}
                              className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                            >
                              Switch to User
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* CREATE NEW SHOP MODAL (Directly accessible from Business & Shop Selection) */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shop-select-create-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full overflow-hidden shadow-xl max-h-[92vh] flex flex-col my-auto">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <Store className="w-5 h-5 text-emerald-400 shrink-0" />
                <h2
                  id="shop-select-create-modal-title"
                  className="text-base font-display font-bold truncate"
                >
                  Create New Shop in {business.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                aria-label="Close create shop form"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => handleCreateShopSubmit(e, false)}
              className="p-4 sm:p-6 space-y-4 text-xs overflow-y-auto"
              noValidate
            >
              {formError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-800"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-slate-600">
                <span>
                  Parent Business: <strong>{business.name}</strong>
                </span>
                <span className="font-mono">ID: {business.id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="onboard-shop-name"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Name *
                  </label>
                  <input
                    id="onboard-shop-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder={`e.g. ${business.name} Flagship Branch`}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-shop-category"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Format / Category
                  </label>
                  <select
                    id="onboard-shop-category"
                    value={categoryInput}
                    onChange={(e) =>
                      setCategoryInput(e.target.value as ShopCategory)
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-emerald-600"
                  >
                    {SHOP_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="onboard-shop-phone"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Phone Number *
                  </label>
                  <input
                    id="onboard-shop-phone"
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="e.g. +234 809 340 1109"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-shop-address"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Street Location or Address *
                  </label>
                  <input
                    id="onboard-shop-address"
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="e.g. 47 Dennis Osadebe Way"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="onboard-shop-city"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    City / District
                  </label>
                  <input
                    id="onboard-shop-city"
                    type="text"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    placeholder="e.g. Asaba / Lagos"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="onboard-shop-desc"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Optional Description
                  </label>
                  <textarea
                    id="onboard-shop-desc"
                    rows={2}
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Optional branch notes, operating hours, or department scope..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Default status will be set to <strong>Active</strong> with a
                  new independent shop catalogue and POS terminal ID.
                </span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex flex-wrap items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
                >
                  Create Shop
                </button>
                <button
                  type="button"
                  onClick={(e) => handleCreateShopSubmit(e, true)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Create &amp; Enter Shop</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordTargetUser && onResetUserPassword && (
        <UserPasswordModal
          targetUser={passwordTargetUser}
          currentUser={currentUser}
          business={business}
          onClose={() => setPasswordTargetUser(null)}
          onSavePassword={(userId, newPwd) => {
            onResetUserPassword(userId, newPwd);
            setFeedbackBanner(
              `Updated password for "${passwordTargetUser.fullName}" (${passwordTargetUser.email}) under ${business.name}.`
            );
          }}
        />
      )}
    </div>
  );
};

