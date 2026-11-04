import React, { useState, useMemo } from 'react';
import {
  Store,
  Plus,
  Search,
  MapPin,
  Phone,
  Users,
  Edit3,
  Eye,
  Power,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  X,
  ShieldCheck,
} from 'lucide-react';
import {
  Business,
  Shop,
  ShopCategory,
  ShopStatus,
  User,
} from '../types/pos';
import {
  CreateShopInput,
  hasPermission,
  validateShopRegistrationInput,
} from '../utils/posCalculations';

interface ShopsManagementPageProps {
  business: Business;
  currentUser: User;
  businessShops: Shop[];
  activeShop: Shop;
  businessUsers: User[];
  onCreateShop: (input: CreateShopInput) => Shop;
  onUpdateShop: (shopId: string, input: CreateShopInput) => void;
  onToggleShopStatus: (shopId: string, nextStatus: ShopStatus) => void;
  onSwitchActiveShop: (shopId: string) => void;
}

const SHOP_CATEGORIES: ShopCategory[] = [
  'Supermarket',
  'Pharmacy',
  'Express Mart',
  'Restaurant & Bakery',
  'Retail Store',
];

export const ShopsManagementPage: React.FC<ShopsManagementPageProps> = ({
  business,
  currentUser,
  businessShops,
  activeShop,
  businessUsers,
  onCreateShop,
  onUpdateShop,
  onToggleShopStatus,
  onSwitchActiveShop,
}) => {
  const canManageShops = hasPermission(currentUser, 'manage_shops');

  // Business Owners see all shops in their own business; Shop Managers/Cashiers see only their assigned shops within their business
  const visibleShops = useMemo(() => {
    const scopedShops = businessShops.filter(
      (s) => s.businessId === business.id
    );
    if (currentUser.role === 'business_owner') return scopedShops;
    return scopedShops.filter((s) =>
      currentUser.assignedShopIds.includes(s.id)
    );
  }, [businessShops, business.id, currentUser]);

  const draftStorageKey = `smartmind_shops_draft_${business.id}`;
  const savedDraft = useMemo(() => {
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

  const [searchQuery, setSearchQuery] = useState<string>(
    savedDraft?.searchQuery ?? ''
  );
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Create / Edit Shop Modal
  const [formOpen, setFormOpen] = useState<boolean>(
    savedDraft?.formOpen ?? false
  );
  const [editingShop, setEditingShop] = useState<Shop | null>(() =>
    savedDraft?.editingShopId
      ? businessShops.find((s) => s.id === savedDraft.editingShopId) ?? null
      : null
  );
  const [nameInput, setNameInput] = useState<string>(
    savedDraft?.nameInput ?? ''
  );
  const [addressInput, setAddressInput] = useState<string>(
    savedDraft?.addressInput ?? ''
  );
  const [cityInput, setCityInput] = useState<string>(
    savedDraft?.cityInput ?? 'Lagos'
  );
  const [phoneInput, setPhoneInput] = useState<string>(
    savedDraft?.phoneInput ?? ''
  );
  const [categoryInput, setCategoryInput] = useState<ShopCategory>(
    savedDraft?.categoryInput ?? 'Supermarket'
  );
  const [descriptionInput, setDescriptionInput] = useState<string>(
    savedDraft?.descriptionInput ?? ''
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Inspect Shop Modal
  const [inspectedShopId, setInspectedShopId] = useState<string | null>(
    savedDraft?.inspectedShopId ?? null
  );
  const inspectedShop = useMemo(
    () => visibleShops.find((s) => s.id === inspectedShopId) ?? null,
    [visibleShops, inspectedShopId]
  );

  React.useEffect(() => {
    const serialized = JSON.stringify({
      searchQuery,
      formOpen,
      editingShopId: editingShop?.id ?? null,
      nameInput,
      addressInput,
      cityInput,
      phoneInput,
      categoryInput,
      descriptionInput,
      inspectedShopId,
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
    searchQuery,
    formOpen,
    editingShop,
    nameInput,
    addressInput,
    cityInput,
    phoneInput,
    categoryInput,
    descriptionInput,
    inspectedShopId,
  ]);

  const filteredShops = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleShops;
    return visibleShops.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.locationCity.toLowerCase().includes(q)
    );
  }, [visibleShops, searchQuery]);

  const getAssignedStaffForShop = (shopId: string): User[] => {
    return businessUsers.filter(
      (u) =>
        u.businessId === business.id &&
        (u.role === 'business_owner' || u.assignedShopIds.includes(shopId))
    );
  };

  const openCreateModal = () => {
    setEditingShop(null);
    setNameInput('');
    setAddressInput('');
    setCityInput('Lagos');
    setPhoneInput('');
    setCategoryInput('Supermarket');
    setDescriptionInput('');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditModal = (shop: Shop) => {
    setEditingShop(shop);
    setNameInput(shop.name);
    setAddressInput(shop.address);
    setCityInput(shop.locationCity);
    setPhoneInput(shop.phone);
    setCategoryInput(shop.category);
    setDescriptionInput(shop.description ?? '');
    setFormError(null);
    setFormOpen(true);
  };

  const handleSubmitShopForm = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateShopInput = {
      name: nameInput,
      address: addressInput,
      locationCity: cityInput,
      phone: phoneInput,
      category: categoryInput,
      description: descriptionInput,
    };

    const validation = validateShopRegistrationInput(
      payload,
      businessShops,
      editingShop?.id
    );
    if (!validation.valid) {
      setFormError(validation.error ?? 'Invalid shop details.');
      return;
    }

    if (editingShop) {
      onUpdateShop(editingShop.id, payload);
      setFeedbackBanner(
        `Updated shop "${payload.name.trim()}" (${editingShop.id}) under ${business.name}.`
      );
    } else {
      const created = onCreateShop(payload);
      setFeedbackBanner(
        `Created new shop "${created.name}" (${created.id}) with status Active and initialized an independent shop catalogue.`
      );
    }
    setFormOpen(false);
  };

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1440px] mx-auto">
      {/* Header Banner */}
      <section
        aria-label="Shop Management Overview"
        className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-display font-bold text-slate-900">
                Shop Management · {business.name}
              </h2>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                Parent Business ID: {business.id}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Each shop belongs strictly to <strong>{business.name}</strong> and operates with an independent product catalogue, pricing, inventory, and sales ledger.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {canManageShops ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>Create Shop</span>
            </button>
          ) : (
            <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
              Read-Only (Assigned Shops View)
            </span>
          )}
        </div>
      </section>

      {feedbackBanner && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900"
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

      {/* Search & Shop Directory Table */}
      <section
        aria-label="Business Shops Table"
        className="bg-white rounded-xl border border-slate-200 overflow-hidden"
      >
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              aria-label="Search shops in business"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by shop name, unique shop ID, code, or location..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
            />
          </div>
          <div className="text-xs text-slate-500">
            Showing <strong className="text-slate-900">{filteredShops.length}</strong> of{' '}
            <strong className="text-slate-900">{visibleShops.length}</strong> authorized shop
            {visibleShops.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[760px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                <th className="py-3 px-3 font-semibold">Shop Name</th>
                <th className="py-3 px-3 font-semibold">Shop &amp; Business IDs</th>
                <th className="py-3 px-3 font-semibold">Address / Location</th>
                <th className="py-3 px-3 font-semibold">Contact Phone</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold text-center">
                  Staff
                </th>
                <th className="py-3 px-3 font-semibold">Created</th>
                <th className="py-3 px-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredShops.map((shop) => {
                const staffList = getAssignedStaffForShop(shop.id);
                const isActive = shop.status === 'active';
                const isCurrentWorkspace = shop.id === activeShop.id;
                return (
                  <tr
                    key={shop.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isCurrentWorkspace ? 'bg-emerald-50/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">
                          {shop.name}
                        </span>
                        {isCurrentWorkspace && (
                          <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded whitespace-nowrap">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        {shop.code} · {shop.category}
                      </p>
                    </td>
                    <td className="py-3 px-3 font-mono whitespace-nowrap">
                      <p className="text-slate-800 font-semibold">{shop.id}</p>
                      <p className="text-slate-500 text-[11px]">
                        Biz: {shop.businessId}
                      </p>
                    </td>
                    <td className="py-3 px-3 text-slate-600 max-w-[200px]">
                      <p className="text-slate-800 truncate">{shop.address}</p>
                      <p className="text-slate-500 truncate">{shop.locationCity}</p>
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                      {shop.phone}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 font-semibold capitalize ${
                          shop.status === 'active'
                            ? 'text-emerald-700'
                            : shop.status === 'maintenance'
                            ? 'text-amber-700'
                            : 'text-slate-500'
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            shop.status === 'active'
                              ? 'bg-emerald-600'
                              : shop.status === 'maintenance'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                          }`}
                        />
                        {shop.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono font-semibold text-slate-900 tabular-nums">
                      {staffList.length}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {shop.createdAt}
                    </td>
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setInspectedShopId(shop.id)}
                          aria-label={`View ${shop.name}`}
                          className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" />
                          <span>View</span>
                        </button>

                        {canManageShops && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(shop)}
                              aria-label={`Edit ${shop.name}`}
                              className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next: ShopStatus = isActive
                                  ? 'inactive'
                                  : 'active';
                                onToggleShopStatus(shop.id, next);
                                setFeedbackBanner(
                                  next === 'inactive'
                                    ? `Deactivated shop "${shop.name}" (${shop.id}).`
                                    : `Activated shop "${shop.name}" (${shop.id}).`
                                );
                              }}
                              aria-label={`${
                                isActive ? 'Deactivate' : 'Activate'
                              } ${shop.name}`}
                              className={`px-2 py-1 rounded-md border font-medium inline-flex items-center gap-1 cursor-pointer ${
                                isActive
                                  ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                                  : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" />
                              <span>{isActive ? 'Deactivate' : 'Activate'}</span>
                            </button>
                          </>
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

      {/* CREATE / EDIT SHOP MODAL */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shop-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-xl w-full overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Store className="w-5 h-5 text-emerald-400" />
                <h2
                  id="shop-modal-title"
                  className="text-base font-display font-bold"
                >
                  {editingShop
                    ? `Edit Shop · ${editingShop.id}`
                    : `Create New Shop in ${business.name}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close shop form"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitShopForm}
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
                <span>Parent Business: <strong>{business.name}</strong></span>
                <span className="font-mono">ID: {business.id}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="shop-form-name"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Name *
                  </label>
                  <input
                    id="shop-form-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="e.g. Surulere Mega Supermarket"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="shop-form-category"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Shop Format / Category
                  </label>
                  <select
                    id="shop-form-category"
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
                    htmlFor="shop-form-phone"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Phone Number *
                  </label>
                  <input
                    id="shop-form-phone"
                    type="text"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="e.g. +234 809 340 1109"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="shop-form-address"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Street Location or Address *
                  </label>
                  <input
                    id="shop-form-address"
                    type="text"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    placeholder="e.g. 52 Adeniran Ogunsanya Street"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="shop-form-city"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    City / District
                  </label>
                  <input
                    id="shop-form-city"
                    type="text"
                    value={cityInput}
                    onChange={(e) => setCityInput(e.target.value)}
                    placeholder="e.g. Surulere, Lagos"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label
                    htmlFor="shop-form-desc"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Optional Description
                  </label>
                  <textarea
                    id="shop-form-desc"
                    rows={2}
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Optional branch notes, operating hours, or department scope..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {!editingShop && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>
                    Default status will be set to <strong>Active</strong> with a new independent shop context.
                  </span>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {editingShop ? 'Save Shop Details' : 'Create Shop'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW SHOP DETAILS & ASSIGNED STAFF MODAL */}
      {inspectedShop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspect-shop-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-xl max-h-[92vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <span className="text-xs font-mono text-emerald-400">
                  Shop ID: {inspectedShop.id} · Parent Business: {inspectedShop.businessId}
                </span>
                <h2
                  id="inspect-shop-title"
                  className="text-base font-display font-bold mt-0.5"
                >
                  {inspectedShop.name} ({inspectedShop.code})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setInspectedShopId(null)}
                aria-label="Close shop details"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-1.5">
                  <p className="text-slate-500 font-medium">Location &amp; Contact</p>
                  <p className="flex items-center gap-1.5 text-slate-800 font-medium">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {inspectedShop.address}, {inspectedShop.locationCity}
                    </span>
                  </p>
                  <p className="flex items-center gap-1.5 text-slate-700 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{inspectedShop.phone}</span>
                  </p>
                  {inspectedShop.description && (
                    <p className="text-slate-600 pt-1">
                      {inspectedShop.description}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-slate-500 font-medium">Operating Metadata</p>
                  <p className="text-slate-800">
                    Status:{' '}
                    <strong className="uppercase text-emerald-700">
                      {inspectedShop.status}
                    </strong>
                  </p>
                  <p className="font-mono text-slate-700">
                    Terminal ID: {inspectedShop.terminalId}
                  </p>
                  <p className="font-mono text-slate-600">
                    Created Date: {inspectedShop.createdAt}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-display font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-emerald-700" />
                  <span>
                    Authorized Personnel for {inspectedShop.name} (
                    {getAssignedStaffForShop(inspectedShop.id).length})
                  </span>
                </h3>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                        <th className="py-2 px-3 font-semibold">Full Name</th>
                        <th className="py-2 px-3 font-semibold">Role</th>
                        <th className="py-2 px-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getAssignedStaffForShop(inspectedShop.id).map((u) => (
                        <tr key={u.id}>
                          <td className="py-2 px-3 font-semibold text-slate-900">
                            {u.fullName}{' '}
                            <span className="font-normal text-slate-500">
                              ({u.email})
                            </span>
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            {u.roleLabel}
                          </td>
                          <td className="py-2 px-3 capitalize font-semibold text-emerald-700">
                            {u.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onSwitchActiveShop(inspectedShop.id);
                    setInspectedShopId(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Switch Active Workspace to {inspectedShop.code}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setInspectedShopId(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
