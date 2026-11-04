import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Store,
  Edit3,
  Power,
  CheckCircle2,
  AlertCircle,
  Lock,
  X,
  Key,
  Plus,
  Trash2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  AccountStatus,
  Business,
  CustomRole,
  PermissionKey,
  Shop,
  ShopAssignment,
  User,
} from '../types/pos';
import {
  canActorResetUserPassword,
  CreateCustomRoleInput,
  CreateStaffInput,
  hasPermission,
  isPermissionAllowedForStaffRole,
  PERMISSION_CATALOGUE,
  ROLE_DEFAULT_PERMISSIONS,
  validateCustomRoleInput,
  validateStaffRegistrationInput,
} from '../utils/posCalculations';
import { UserPasswordModal } from '../components/common/UserPasswordModal';

interface StaffManagementPageProps {
  business: Business;
  currentUser: User;
  businessUsers: User[];
  businessShops: Shop[];
  shopAssignments: ShopAssignment[];
  allUsers: User[];
  customRoles?: CustomRole[];
  onCreateStaff: (input: CreateStaffInput) => User;
  onUpdateStaff: (
    userId: string,
    input: CreateStaffInput,
    status: AccountStatus
  ) => void;
  onToggleStaffStatus: (userId: string, nextStatus: AccountStatus) => void;
  onResetUserPassword?: (userId: string, newPassword: string) => void;
  onCreateCustomRole?: (input: CreateCustomRoleInput) => CustomRole;
  onUpdateCustomRole?: (roleId: string, input: CreateCustomRoleInput) => void;
  onDeleteCustomRole?: (roleId: string) => { success: boolean; error?: string };
}

export const StaffManagementPage: React.FC<StaffManagementPageProps> = ({
  business,
  currentUser,
  businessUsers,
  businessShops,
  shopAssignments,
  allUsers,
  customRoles = [],
  onCreateStaff,
  onUpdateStaff,
  onToggleStaffStatus,
  onResetUserPassword,
  onCreateCustomRole,
  onUpdateCustomRole,
  onDeleteCustomRole,
}) => {
  const canManageStaff =
    hasPermission(currentUser, 'manage_staff') ||
    currentUser.role === 'business_owner' ||
    currentUser.role === 'platform_admin';

  const canManageRoles =
    currentUser.role === 'business_owner' ||
    currentUser.role === 'platform_admin';

  const [activeTab, setActiveTab] = useState<'staff' | 'roles'>('staff');
  const [passwordTargetUser, setPasswordTargetUser] = useState<User | null>(
    null
  );

  // Filter roles relevant to this business + platform default built-ins
  const availableRoles = useMemo(() => {
    return customRoles.filter(
      (r) => r.businessId === business.id || r.businessId === 'PLATFORM'
    );
  }, [customRoles, business.id]);

  // Business Owners see all staff in their own business; Shop Managers see staff assigned to their shops within their business (strictly excluding the Business Owner)
  const visibleStaff = useMemo(() => {
    const scopedToBusiness = businessUsers.filter(
      (u) => u.businessId === business.id && u.role !== 'platform_admin'
    );
    if (currentUser.role === 'business_owner' || currentUser.role === 'platform_admin') {
      return scopedToBusiness;
    }
    const managerShopSet = new Set(currentUser.assignedShopIds);
    return scopedToBusiness.filter(
      (u) =>
        u.role !== 'business_owner' &&
        u.assignedShopIds.some((id) => managerShopSet.has(id))
    );
  }, [businessUsers, business.id, currentUser]);

  const draftStorageKey = `smartmind_staff_draft_${business.id}`;
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
  const [roleFilter, setRoleFilter] = useState<string>(
    savedDraft?.roleFilter ?? 'all'
  );
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Create / Edit Staff Modal
  const [formOpen, setFormOpen] = useState<boolean>(
    savedDraft?.formOpen ?? false
  );
  const [editingStaff, setEditingStaff] = useState<User | null>(() =>
    savedDraft?.editingStaffId
      ? businessUsers.find((u) => u.id === savedDraft.editingStaffId) ?? null
      : null
  );
  const [fullNameInput, setFullNameInput] = useState<string>(
    savedDraft?.fullNameInput ?? ''
  );
  const [emailInput, setEmailInput] = useState<string>(
    savedDraft?.emailInput ?? ''
  );
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>(
    savedDraft?.selectedRoleKey ?? 'cashier'
  );
  const [roleLabelInput, setRoleLabelInput] = useState<string>(
    savedDraft?.roleLabelInput ?? 'Cashier'
  );
  const [customRoleIdInput, setCustomRoleIdInput] = useState<string | undefined>(
    savedDraft?.customRoleIdInput
  );
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>(
    savedDraft?.selectedShopIds ?? []
  );
  const [selectedPermissions, setSelectedPermissions] = useState<
    PermissionKey[]
  >(savedDraft?.selectedPermissions ?? [...ROLE_DEFAULT_PERMISSIONS.cashier]);
  const [statusInput, setStatusInput] = useState<AccountStatus>(
    savedDraft?.statusInput ?? 'active'
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Create / Edit Custom Staff Role Modal State
  const [roleModalOpen, setRoleModalOpen] = useState<boolean>(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [roleNameInput, setRoleNameInput] = useState<string>('');
  const [roleDescInput, setRoleDescInput] = useState<string>('');
  const [rolePermissionsInput, setRolePermissionsInput] = useState<
    PermissionKey[]
  >([]);
  const [roleFormError, setRoleFormError] = useState<string | null>(null);

  React.useEffect(() => {
    const serialized = JSON.stringify({
      searchQuery,
      roleFilter,
      formOpen,
      editingStaffId: editingStaff?.id ?? null,
      fullNameInput,
      emailInput,
      selectedRoleKey,
      roleLabelInput,
      customRoleIdInput,
      selectedShopIds,
      selectedPermissions,
      statusInput,
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
    roleFilter,
    formOpen,
    editingStaff,
    fullNameInput,
    emailInput,
    selectedRoleKey,
    roleLabelInput,
    customRoleIdInput,
    selectedShopIds,
    selectedPermissions,
    statusInput,
  ]);

  const filteredStaff = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleStaff.filter((u) => {
      if (roleFilter !== 'all') {
        if (roleFilter === 'business_owner' && u.role !== 'business_owner') return false;
        if (roleFilter === 'shop_manager' && u.role !== 'shop_manager') return false;
        if (roleFilter === 'cashier' && u.role !== 'cashier') return false;
        if (
          roleFilter.startsWith('custom:') &&
          u.customRoleId !== roleFilter.replace('custom:', '') &&
          u.role !== roleFilter.replace('custom:', '')
        ) {
          return false;
        }
      }
      if (!q) return true;
      return (
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleLabel.toLowerCase().includes(q)
      );
    });
  }, [visibleStaff, searchQuery, roleFilter]);

  const openCreateStaffModal = () => {
    setEditingStaff(null);
    setFullNameInput('');
    setEmailInput('');
    setSelectedRoleKey('cashier');
    setRoleLabelInput('Cashier');
    setCustomRoleIdInput(undefined);
    setSelectedShopIds(businessShops[0] ? [businessShops[0].id] : []);
    setSelectedPermissions([...ROLE_DEFAULT_PERMISSIONS.cashier]);
    setStatusInput('active');
    setFormError(null);
    setFormOpen(true);
  };

  const openEditStaffModal = (staffUser: User) => {
    if (staffUser.role === 'business_owner') return;
    setEditingStaff(staffUser);
    setFullNameInput(staffUser.fullName);
    setEmailInput(staffUser.email);

    const matchingCustom = availableRoles.find(
      (r) => r.id === staffUser.customRoleId || r.id === staffUser.role
    );
    if (matchingCustom) {
      setSelectedRoleKey(`custom:${matchingCustom.id}`);
      setRoleLabelInput(matchingCustom.name);
      setCustomRoleIdInput(matchingCustom.id);
    } else {
      setSelectedRoleKey(staffUser.role);
      setRoleLabelInput(
        staffUser.role === 'shop_manager' ? 'Shop Manager' : 'Cashier'
      );
      setCustomRoleIdInput(undefined);
    }

    setSelectedShopIds([...staffUser.assignedShopIds]);
    setSelectedPermissions([...staffUser.permissions]);
    setStatusInput(staffUser.status);
    setFormError(null);
    setFormOpen(true);
  };

  const effectiveStaffBaseRole: 'shop_manager' | 'cashier' =
    selectedRoleKey === 'shop_manager' ? 'shop_manager' : 'cashier';

  const handleRoleSelectChange = (roleKey: string) => {
    setSelectedRoleKey(roleKey);
    if (roleKey === 'cashier') {
      setRoleLabelInput('Cashier');
      setCustomRoleIdInput(undefined);
      setSelectedPermissions([...ROLE_DEFAULT_PERMISSIONS.cashier]);
    } else if (roleKey === 'shop_manager') {
      setRoleLabelInput('Shop Manager');
      setCustomRoleIdInput(undefined);
      setSelectedPermissions([...ROLE_DEFAULT_PERMISSIONS.shop_manager]);
    } else if (roleKey.startsWith('custom:')) {
      const customId = roleKey.replace('custom:', '');
      const matched = availableRoles.find((r) => r.id === customId);
      if (matched) {
        setRoleLabelInput(matched.name);
        setCustomRoleIdInput(matched.id);
        const allowedForCashier = matched.permissions.filter((perm) =>
          isPermissionAllowedForStaffRole('cashier', perm)
        );
        setSelectedPermissions(
          allowedForCashier.length > 0
            ? allowedForCashier
            : [...ROLE_DEFAULT_PERMISSIONS.cashier]
        );
      }
    }
  };

  const toggleShopSelection = (shopId: string) => {
    setSelectedShopIds((prev) =>
      prev.includes(shopId)
        ? prev.filter((id) => id !== shopId)
        : [...prev, shopId]
    );
  };

  const togglePermissionSelection = (permKey: PermissionKey) => {
    if (!isPermissionAllowedForStaffRole(effectiveStaffBaseRole, permKey)) {
      return;
    }
    setSelectedPermissions((prev) =>
      prev.includes(permKey)
        ? prev.filter((k) => k !== permKey)
        : [...prev, permKey]
    );
  };

  const handleSubmitStaffForm = (e: React.FormEvent) => {
    e.preventDefault();
    const isCustom = selectedRoleKey.startsWith('custom:');
    const baseRole = isCustom
      ? 'cashier'
      : (selectedRoleKey as 'shop_manager' | 'cashier');

    const payload: CreateStaffInput = {
      fullName: fullNameInput,
      email: emailInput,
      role: baseRole,
      roleLabel: roleLabelInput,
      customRoleId: customRoleIdInput,
      assignedShopIds: selectedShopIds,
      permissions: selectedPermissions,
    };

    const validation = validateStaffRegistrationInput(
      payload,
      business.id,
      allUsers,
      businessShops,
      editingStaff?.id
    );
    if (!validation.valid) {
      setFormError(validation.error ?? 'Invalid staff configuration.');
      return;
    }

    if (editingStaff) {
      onUpdateStaff(editingStaff.id, payload, statusInput);
      setFeedbackBanner(
        `Updated staff member "${payload.fullName.trim()}" (${roleLabelInput}) with ${payload.assignedShopIds.length} assigned shop(s) and ${payload.permissions.length} permission(s).`
      );
    } else {
      const created = onCreateStaff(payload);
      setFeedbackBanner(
        `Created staff account for "${created.fullName}" (${roleLabelInput}) under ${business.name}.`
      );
    }
    setFormOpen(false);
  };

  // Custom Staff Role Handlers
  const openCreateRoleModal = () => {
    setEditingRole(null);
    setRoleNameInput('');
    setRoleDescInput('');
    setRolePermissionsInput([...ROLE_DEFAULT_PERMISSIONS.cashier]);
    setRoleFormError(null);
    setRoleModalOpen(true);
  };

  const openEditRoleModal = (role: CustomRole) => {
    setEditingRole(role);
    setRoleNameInput(role.name);
    setRoleDescInput(role.description);
    setRolePermissionsInput([...role.permissions]);
    setRoleFormError(null);
    setRoleModalOpen(true);
  };

  const handleToggleRolePermission = (permKey: PermissionKey) => {
    setRolePermissionsInput((prev) =>
      prev.includes(permKey)
        ? prev.filter((k) => k !== permKey)
        : [...prev, permKey]
    );
  };

  const handleSubmitRoleForm = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateCustomRoleInput = {
      businessId: business.id,
      name: roleNameInput,
      description: roleDescInput,
      permissions: rolePermissionsInput,
    };

    const validation = validateCustomRoleInput(
      payload,
      availableRoles,
      editingRole?.id
    );

    if (!validation.valid) {
      setRoleFormError(validation.error ?? 'Invalid role configuration.');
      return;
    }

    if (editingRole && onUpdateCustomRole) {
      onUpdateCustomRole(editingRole.id, payload);
      setFeedbackBanner(
        `Updated custom staff role "${payload.name.trim()}" with ${payload.permissions.length} permissions.`
      );
    } else if (onCreateCustomRole) {
      const created = onCreateCustomRole(payload);
      setFeedbackBanner(
        `Created new custom staff role "${created.name}" with ${created.permissions.length} permissions.`
      );
    }

    setRoleModalOpen(false);
  };

  const handleDeleteRoleClick = (role: CustomRole) => {
    if (role.isBuiltIn) {
      setFeedbackBanner(`System default role "${role.name}" cannot be deleted.`);
      return;
    }

    // Check if any active user is assigned to this role
    const assignedUsers = businessUsers.filter(
      (u) => u.customRoleId === role.id || u.role === role.id
    );

    if (assignedUsers.length > 0) {
      setFeedbackBanner(
        `Cannot delete role "${role.name}" because ${assignedUsers.length} staff member(s) (${assignedUsers.map((u) => u.fullName).join(', ')}) are assigned to it. Reassign them first.`
      );
      return;
    }

    if (
      window.confirm(
        `Are you sure you want to delete the custom staff role "${role.name}"?`
      )
    ) {
      if (onDeleteCustomRole) {
        const res = onDeleteCustomRole(role.id);
        if (res.error) {
          setFeedbackBanner(res.error);
        } else {
          setFeedbackBanner(`Deleted custom staff role "${role.name}".`);
        }
      }
    }
  };

  return (
    <div className="p-3.5 sm:p-5 lg:p-6 space-y-4 sm:space-y-6 max-w-[1440px] mx-auto">
      {/* Header Banner */}
      <section
        aria-label="Staff and Permission Management Overview"
        className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-display font-bold text-slate-900">
                Staff &amp; Role Management · {business.name}
              </h2>
              <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
                Primary Owner: {business.ownerName}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Create custom staff roles, assign granular permissions, and bind staff members to specific shop branches within <strong>{business.name}</strong>. Business Owners and Super Admins have full access to configure roles and permissions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canManageRoles && (
            <button
              type="button"
              onClick={openCreateRoleModal}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer min-h-[40px]"
            >
              <Plus className="w-4 h-4 text-emerald-700" />
              <span>Create Custom Role</span>
            </button>
          )}

          {canManageStaff ? (
            <button
              type="button"
              onClick={openCreateStaffModal}
              className="w-full sm:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer whitespace-nowrap min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create Staff Account</span>
            </button>
          ) : (
            <span className="text-xs font-mono text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg">
              View-Only Staff Directory
            </span>
          )}
        </div>
      </section>

      {/* Tabs Navigation */}
      <div className="flex items-center border-b border-slate-200 gap-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab('staff')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'staff'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Accounts ({visibleStaff.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('roles')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
            activeTab === 'roles'
              ? 'border-emerald-600 text-emerald-800 bg-emerald-50/50 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Staff Roles &amp; Permission Templates ({availableRoles.length})</span>
        </button>
      </div>

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
            className="text-emerald-700 hover:text-emerald-950 font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: STAFF ACCOUNTS */}
      {activeTab === 'staff' && (
        <section
          aria-label="Business Staff Table"
          className="bg-white rounded-xl border border-slate-200 overflow-hidden space-y-0"
        >
          <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                aria-label="Search staff members"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by staff full name, email, or role..."
                className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-emerald-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="staff-role-filter" className="text-xs text-slate-500">
                Filter Role:
              </label>
              <select
                id="staff-role-filter"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
              >
                <option value="all">All Roles ({visibleStaff.length})</option>
                {(currentUser.role === 'business_owner' || currentUser.role === 'platform_admin') && (
                  <option value="business_owner">Primary Business Owner</option>
                )}
                <option value="shop_manager">Shop Manager (Default)</option>
                <option value="cashier">Cashier (Default)</option>
                {availableRoles
                  .filter((r) => !r.isBuiltIn)
                  .map((r) => (
                    <option key={r.id} value={`custom:${r.id}`}>
                      {r.name} (Custom)
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="py-3 px-3 font-semibold">Staff Member &amp; Email</th>
                  <th className="py-3 px-3 font-semibold">Assigned Role</th>
                  <th className="py-3 px-3 font-semibold">Assigned Shops</th>
                  <th className="py-3 px-3 font-semibold">Permission Summary</th>
                  <th className="py-3 px-3 font-semibold">Status</th>
                  <th className="py-3 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((staff) => {
                  const isPrimaryOwner = staff.role === 'business_owner';
                  const isActive = staff.status === 'active';
                  const assignedShopsObjs = isPrimaryOwner
                    ? businessShops
                    : businessShops.filter((s) =>
                        staff.assignedShopIds.includes(s.id)
                      );

                  return (
                    <tr
                      key={staff.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">
                          {staff.fullName}
                        </p>
                        <p className="font-mono text-slate-600 text-[11px] mt-0.5">
                          {staff.email}
                        </p>
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isPrimaryOwner
                              ? 'text-emerald-800'
                              : staff.role === 'shop_manager'
                              ? 'text-slate-900'
                              : 'text-purple-800'
                          }`}
                        >
                          {staff.roleLabel ||
                            (isPrimaryOwner
                              ? 'Primary Owner'
                              : staff.role === 'shop_manager'
                              ? 'Shop Manager'
                              : 'Cashier')}
                        </span>
                        {staff.customRoleId && (
                          <span className="ml-1.5 text-[10px] font-mono bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.2 rounded">
                            Custom Role
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 max-w-[210px]">
                        {isPrimaryOwner ? (
                          <span className="text-emerald-700 font-medium">
                            All Business Shops ({businessShops.length})
                          </span>
                        ) : assignedShopsObjs.length === 0 ? (
                          <span className="text-amber-700 font-medium">
                            No shops assigned (0)
                          </span>
                        ) : (
                          <div className="space-y-0.5">
                            {assignedShopsObjs.map((s) => (
                              <p
                                key={s.id}
                                className="text-slate-800 font-medium truncate"
                                title={`${s.name} (${s.code})`}
                              >
                                {s.name}{' '}
                                <span className="font-mono text-slate-500">
                                  ({s.code})
                                </span>
                              </p>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {isPrimaryOwner ? (
                          <span className="text-slate-700 font-medium">
                            Full Permissions ({PERMISSION_CATALOGUE.length}/{PERMISSION_CATALOGUE.length})
                          </span>
                        ) : (
                          <div>
                            <p className="font-semibold text-slate-800">
                              {staff.permissions.length} permission
                              {staff.permissions.length === 1 ? '' : 's'} granted
                            </p>
                            <p className="font-mono text-[11px] text-slate-500 mt-0.5 max-w-[200px] truncate">
                              {staff.permissions.join(', ') || 'None'}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold capitalize ${
                            isActive ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isActive ? 'bg-emerald-600' : 'bg-red-600'
                            }`}
                          />
                          {staff.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          {onResetUserPassword &&
                            canActorResetUserPassword(currentUser, staff) && (
                              <button
                                type="button"
                                onClick={() => setPasswordTargetUser(staff)}
                                aria-label={`${
                                  staff.id === currentUser.id
                                    ? 'Change password'
                                    : 'Reset password'
                                } for ${staff.fullName}`}
                                className="px-2 py-1 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Key className="w-3.5 h-3.5" />
                                <span>
                                  {staff.id === currentUser.id
                                    ? 'Change Password'
                                    : 'Reset Password'}
                                </span>
                              </button>
                            )}

                          {isPrimaryOwner ? (
                            <span className="inline-flex items-center gap-1 text-slate-400 font-mono text-[11px] px-1">
                              <Lock className="w-3.5 h-3.5" />
                              <span>Primary Owner</span>
                            </span>
                          ) : canManageStaff ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditStaffModal(staff)}
                                aria-label={`Edit ${staff.fullName}`}
                                className="px-2 py-1 rounded-md border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next: AccountStatus = isActive
                                    ? 'suspended'
                                    : 'active';
                                  onToggleStaffStatus(staff.id, next);
                                  setFeedbackBanner(
                                    next === 'suspended'
                                      ? `Suspended staff account "${staff.fullName}".`
                                      : `Activated staff account "${staff.fullName}".`
                                  );
                                }}
                                aria-label={`${
                                  isActive ? 'Suspend' : 'Activate'
                                } ${staff.fullName}`}
                                className={`px-2 py-1 rounded-md border font-medium inline-flex items-center gap-1 cursor-pointer ${
                                  isActive
                                    ? 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800'
                                    : 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>{isActive ? 'Suspend' : 'Activate'}</span>
                              </button>
                            </>
                          ) : (
                            !canActorResetUserPassword(currentUser, staff) && (
                              <span className="text-slate-400 font-mono text-[11px]">
                                Read-only
                              </span>
                            )
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
      )}

      {/* TAB 2: ROLES & PERMISSION TEMPLATES */}
      {activeTab === 'roles' && (
        <section
          aria-label="Staff Roles & Permission Templates"
          className="space-y-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-display font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-700" />
                <span>Configured Staff Roles &amp; Permission Templates</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Business Owners and Super Admins can define custom staff roles (e.g. Shift Lead, Stock Officer, Auditor) and assign granular permissions.
              </p>
            </div>
            {canManageRoles && (
              <button
                type="button"
                onClick={openCreateRoleModal}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>Create New Custom Role</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableRoles.map((role) => {
              const assignedCount = businessUsers.filter(
                (u) => u.customRoleId === role.id || u.role === role.id
              ).length;

              return (
                <div
                  key={role.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 flex flex-col justify-between hover:border-emerald-300 transition-colors shadow-xs"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-display font-bold text-slate-900 flex items-center gap-1.5">
                          <span>{role.name}</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {role.description}
                        </p>
                      </div>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded shrink-0 ${
                          role.isBuiltIn
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        }`}
                      >
                        {role.isBuiltIn ? 'System Default' : 'Custom Role'}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-semibold">
                          Permissions ({role.permissions.length}):
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {assignedCount} staff assigned
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {role.permissions.map((pk) => {
                          const cat = PERMISSION_CATALOGUE.find((p) => p.key === pk);
                          return (
                            <span
                              key={pk}
                              className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200"
                              title={cat?.description}
                            >
                              {cat?.label ?? pk}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-slate-400 font-mono">
                      Created by: {role.createdByName || role.createdByUserId}
                    </span>

                    {canManageRoles && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditRoleModal(role)}
                          className="px-2 py-1 text-slate-700 hover:bg-slate-100 rounded border border-slate-200 font-semibold cursor-pointer text-xs"
                        >
                          Edit
                        </button>
                        {!role.isBuiltIn && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRoleClick(role)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded border border-red-200 cursor-pointer"
                            title="Delete custom role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* CREATE / EDIT STAFF & PERMISSIONS MODAL */}
      {formOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-xl my-4 sm:my-8 max-h-[92vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h2
                  id="staff-modal-title"
                  className="text-base font-display font-bold"
                >
                  {editingStaff
                    ? `Edit Staff Account · ${editingStaff.fullName}`
                    : `Create Staff Account in ${business.name}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                aria-label="Close staff modal"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitStaffForm}
              className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs overflow-y-auto"
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="staff-form-name"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Staff Full Name *
                  </label>
                  <input
                    id="staff-form-name"
                    type="text"
                    value={fullNameInput}
                    onChange={(e) => setFullNameInput(e.target.value)}
                    placeholder="e.g. Funke Akindele"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="staff-form-email"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Staff Email Address *
                  </label>
                  <input
                    id="staff-form-email"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="e.g. funke.cashier@emeraldcrest.demo"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label
                    htmlFor="staff-form-role"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Staff Role &amp; Permission Template *
                  </label>
                  <select
                    id="staff-form-role"
                    value={selectedRoleKey}
                    onChange={(e) => handleRoleSelectChange(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-emerald-600 font-medium"
                  >
                    <optgroup label="System Default Roles">
                      <option value="cashier">
                        Cashier (Front-desk sales &amp; invoices)
                      </option>
                      <option value="shop_manager">
                        Shop Manager (Full shop ops &amp; reports)
                      </option>
                    </optgroup>
                    {availableRoles.filter((r) => !r.isBuiltIn).length > 0 && (
                      <optgroup label="Custom Business Roles">
                        {availableRoles
                          .filter((r) => !r.isBuiltIn)
                          .map((r) => (
                            <option key={r.id} value={`custom:${r.id}`}>
                              {r.name} ({r.permissions.length} permissions)
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </select>
                </div>

                {editingStaff && (
                  <div>
                    <label
                      htmlFor="staff-form-status"
                      className="block font-semibold text-slate-700 mb-1"
                    >
                      Account Status
                    </label>
                    <select
                      id="staff-form-status"
                      value={statusInput}
                      onChange={(e) =>
                        setStatusInput(e.target.value as AccountStatus)
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:border-emerald-600"
                    >
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Shop Assignment Selection */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-slate-900 flex items-center gap-1.5">
                    <Store className="w-4 h-4 text-emerald-700" />
                    <span>Assign Authorized Shops in {business.name}</span>
                  </p>
                  <span className="font-mono text-slate-500">
                    {selectedShopIds.length} selected
                  </span>
                </div>
                <p className="text-slate-500">
                  Shop Managers, Cashiers, and custom roles can only access shops checked below.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {businessShops.map((shop) => {
                    const checked = selectedShopIds.includes(shop.id);
                    return (
                      <label
                        key={shop.id}
                        className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer select-none ${
                          checked
                            ? 'bg-emerald-50/70 border-emerald-600 text-slate-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleShopSelection(shop.id)}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">
                            {shop.name}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {shop.code} · {shop.id}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Permission Checkboxes */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-700" />
                    <span>Explicit Granular Permissions</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => handleRoleSelectChange(selectedRoleKey)}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold underline"
                  >
                    Reset to Role Template Defaults
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {PERMISSION_CATALOGUE.filter((perm) =>
                    isPermissionAllowedForStaffRole(
                      effectiveStaffBaseRole,
                      perm.key
                    )
                  ).map((perm) => {
                    const checked = selectedPermissions.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer select-none ${
                          checked
                            ? 'bg-emerald-50/60 border-emerald-600 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePermissionSelection(perm.key)}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {perm.label}
                          </p>
                          <p className="font-mono text-[11px] text-emerald-800">
                            {perm.key}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {editingStaff ? 'Save Staff & Permissions' : 'Create Staff Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CUSTOM STAFF ROLE MODAL */}
      {roleModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="role-modal-title"
          className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-xl my-4 sm:my-8 max-h-[92vh] flex flex-col">
            <div className="px-5 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h2
                  id="role-modal-title"
                  className="text-base font-display font-bold"
                >
                  {editingRole
                    ? `Edit Custom Staff Role · ${editingRole.name}`
                    : `Create Custom Staff Role in ${business.name}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setRoleModalOpen(false)}
                aria-label="Close role modal"
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitRoleForm}
              className="p-4 sm:p-6 space-y-4 sm:space-y-5 text-xs overflow-y-auto"
              noValidate
            >
              {roleFormError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 text-red-800"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{roleFormError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="role-form-name"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Custom Role Name / Title *
                  </label>
                  <input
                    id="role-form-name"
                    type="text"
                    value={roleNameInput}
                    onChange={(e) => setRoleNameInput(e.target.value)}
                    placeholder="e.g. Shift Lead / Inventory Specialist / Sales Auditor"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600 font-medium"
                  />
                </div>

                <div>
                  <label
                    htmlFor="role-form-desc"
                    className="block font-semibold text-slate-700 mb-1"
                  >
                    Role Description &amp; Scope *
                  </label>
                  <textarea
                    id="role-form-desc"
                    rows={2}
                    value={roleDescInput}
                    onChange={(e) => setRoleDescInput(e.target.value)}
                    placeholder="e.g. Responsible for product catalogue maintenance, stock counts, receiving supplier orders, and inventory adjustments."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Permission Checkboxes for Custom Role */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-display font-bold text-slate-900 flex items-center gap-1.5">
                    <Shield className="w-4 h-4 text-emerald-700" />
                    <span>Assign Granular Capability Permissions *</span>
                  </p>
                  <span className="font-mono text-slate-500">
                    {rolePermissionsInput.length} granted
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {PERMISSION_CATALOGUE.map((perm) => {
                    const checked = rolePermissionsInput.includes(perm.key);
                    return (
                      <label
                        key={perm.key}
                        className={`p-2.5 rounded-lg border flex items-start gap-2.5 cursor-pointer select-none ${
                          checked
                            ? 'bg-emerald-50/60 border-emerald-600 text-slate-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleRolePermission(perm.key)}
                          className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600"
                        />
                        <div>
                          <p className="font-semibold text-slate-900">
                            {perm.label}
                          </p>
                          <p className="font-mono text-[11px] text-emerald-800">
                            {perm.key}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {perm.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRoleModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  {editingRole ? 'Save Role Changes' : 'Create Custom Role'}
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
