import React, { useState, useMemo } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Edit3,
  Trash2,
  CheckCircle2,
  X,
  Upload,
  Calendar,
  Building2,
  Power,
  AlertCircle,
} from 'lucide-react';
import {
  Business,
  PayrollEmployee,
  SalaryType,
  Shop,
  User,
} from '../types/pos';
import { formatCurrency, getTodayYmd } from '../utils/posCalculations';

interface PayrollEmployeesPageProps {
  business: Business;
  shop: Shop;
  businessUsers: User[];
  employees: PayrollEmployee[];
  onSaveEmployee: (employee: PayrollEmployee) => Promise<void> | void;
  onDeleteEmployee: (employeeId: string) => Promise<void> | void;
}

export const PayrollEmployeesPage: React.FC<PayrollEmployeesPageProps> = ({
  business,
  shop,
  businessUsers,
  employees,
  onSaveEmployee,
  onDeleteEmployee,
}) => {
  const symbol = business.currencySymbol || '₦';
  const [statusTab, setStatusTab] = useState<'active' | 'inactive' | 'all'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<PayrollEmployee | null>(null);
  const [staffSearchQuery, setStaffSearchQuery] = useState('');
  const [linkedUserId, setLinkedUserId] = useState<string | undefined>(undefined);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [startDate, setStartDate] = useState(getTodayYmd());
  const [salaryType, setSalaryType] = useState<SalaryType>('monthly');
  const [baseSalary, setBaseSalary] = useState('');
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionRatePercent, setCommissionRatePercent] = useState('2');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [includeInPayroll, setIncludeInPayroll] = useState(true);
  const [enablePayeTax, setEnablePayeTax] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const shopEmployees = useMemo(
    () => employees.filter((e) => e.shopId === shop.id && e.businessId === business.id),
    [employees, shop.id, business.id]
  );

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return shopEmployees.filter((e) => {
      if (statusTab !== 'all' && e.status !== statusTab) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.position.toLowerCase().includes(q) ||
        e.phone.toLowerCase().includes(q) ||
        e.bankName.toLowerCase().includes(q)
      );
    });
  }, [shopEmployees, statusTab, searchQuery]);

  const matchingStaffUsers = useMemo(() => {
    const q = staffSearchQuery.trim().toLowerCase();
    const scoped = businessUsers.filter(
      (u) =>
        u.role !== 'platform_admin' &&
        (u.role === 'business_owner' || u.assignedShopIds.includes(shop.id))
    );
    if (!q) return scoped;
    return scoped.filter(
      (u) =>
        u.fullName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.roleLabel.toLowerCase().includes(q)
    );
  }, [businessUsers, shop.id, staffSearchQuery]);

  const openAddModal = () => {
    setEditingEmployee(null);
    setStaffSearchQuery('');
    setLinkedUserId(undefined);
    setFullName('');
    setPhone('');
    setPosition('');
    setStartDate(getTodayYmd());
    setSalaryType('monthly');
    setBaseSalary('');
    setCommissionEnabled(false);
    setCommissionRatePercent('2');
    setBankName('');
    setAccountNumber('');
    setAccountName('');
    setIncludeInPayroll(true);
    setEnablePayeTax(false);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const openEditModal = (emp: PayrollEmployee) => {
    setEditingEmployee(emp);
    setStaffSearchQuery('');
    setLinkedUserId(emp.linkedUserId);
    setFullName(emp.fullName);
    setPhone(emp.phone);
    setPosition(emp.position);
    setStartDate(emp.startDate || getTodayYmd());
    setSalaryType(emp.salaryType);
    setBaseSalary(String(emp.baseSalary));
    setCommissionEnabled(Boolean(emp.commissionEnabled));
    setCommissionRatePercent(String(emp.commissionRatePercent ?? 2));
    setBankName(emp.bankName);
    setAccountNumber(emp.accountNumber);
    setAccountName(emp.accountName);
    setIncludeInPayroll(emp.includeInPayroll);
    setEnablePayeTax(emp.enablePayeTax);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSelectStaffUser = (u: User) => {
    setLinkedUserId(u.id);
    setFullName(u.fullName);
    setPosition(u.roleLabel || u.role);
    setStaffSearchQuery('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsedSalary = parseFloat(baseSalary);
    if (!fullName.trim()) {
      setErrorMsg('Full Name is required.');
      return;
    }
    if (!position.trim()) {
      setErrorMsg('Role / Position is required.');
      return;
    }
    if (!startDate) {
      setErrorMsg('Start Date (resumption date) is required.');
      return;
    }
    if (Number.isNaN(parsedSalary) || parsedSalary < 0) {
      setErrorMsg('Please enter a valid Base Salary.');
      return;
    }

    const nowIso = new Date().toISOString();
    const record: PayrollEmployee = {
      id:
        editingEmployee?.id ||
        `emp-${shop.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      businessId: business.id,
      shopId: shop.id,
      ...(linkedUserId ? { linkedUserId } : {}),
      fullName: fullName.trim(),
      phone: phone.trim(),
      position: position.trim(),
      startDate,
      salaryType,
      baseSalary: parsedSalary,
      commissionEnabled,
      ...(commissionEnabled
        ? { commissionRatePercent: Math.max(0, parseFloat(commissionRatePercent) || 0) }
        : {}),
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      accountName: accountName.trim(),
      includeInPayroll,
      enablePayeTax,
      payeRatePercent: 7,
      status: editingEmployee?.status || 'active',
      createdAt: editingEmployee?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    setIsSaving(true);
    try {
      await onSaveEmployee(record);
      setModalOpen(false);
      setBanner(
        editingEmployee
          ? `Updated employee "${record.fullName}".`
          : `Added employee "${record.fullName}" to ${shop.name} payroll.`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save employee.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) {
        setErrorMsg('CSV file must have a header row and at least one employee row.');
        return;
      }
      let added = 0;
      const nowIso = new Date().toISOString();
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
        const name = cols[0];
        if (!name) continue;
        const empPhone = cols[1] || '';
        const empRole = cols[2] || 'Staff';
        const empStart = /^\d{4}-\d{2}-\d{2}$/.test(cols[3] || '') ? cols[3] : getTodayYmd();
        const empSalary = Math.max(0, parseFloat(cols[4] || '0') || 0);
        const empBank = cols[5] || '';
        const empAcct = cols[6] || '';
        const empAcctName = cols[7] || name;

        await onSaveEmployee({
          id: `emp-${shop.id}-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
          businessId: business.id,
          shopId: shop.id,
          fullName: name,
          phone: empPhone,
          position: empRole,
          startDate: empStart,
          salaryType: 'monthly',
          baseSalary: empSalary,
          commissionEnabled: false,
          bankName: empBank,
          accountNumber: empAcct,
          accountName: empAcctName,
          includeInPayroll: true,
          enablePayeTax: false,
          payeRatePercent: 7,
          status: 'active',
          createdAt: nowIso,
          updatedAt: nowIso,
        });
        added++;
      }
      setBanner(`Imported ${added} employee(s) from CSV into ${shop.name}.`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse CSV upload.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-5">
      {/* Header & Actions */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-bold text-slate-900">
            Employees · {shop.name} ({shop.code})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage payroll profiles, resumption start dates, salary setup &amp; bank details for {business.name}.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employees..."
              className="pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-600 w-52"
            />
          </div>

          <label className="px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            <span>Bulk Upload</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleBulkCsvUpload}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Add Employee</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {banner && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-emerald-900">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>{banner}</span>
          </div>
          <button type="button" onClick={() => setBanner(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="border-b border-slate-200 px-4 flex items-center gap-6">
          {(['active', 'inactive', 'all'] as const).map((tab) => {
            const count =
              tab === 'all'
                ? shopEmployees.length
                : shopEmployees.filter((e) => e.status === tab).length;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusTab(tab)}
                className={`py-3 text-xs font-semibold border-b-2 transition cursor-pointer capitalize ${
                  statusTab === tab
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab} ({count})
              </button>
            );
          })}
        </div>

        {filteredEmployees.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">
              No {statusTab === 'all' ? '' : statusTab} employees found
            </p>
            <p className="text-xs text-slate-500">
              Click <strong>+ Add Employee</strong> to add staff to {shop.name} payroll.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <tr>
                  <th className="py-3 px-4">Employee &amp; Role</th>
                  <th className="py-3 px-4">Start Date</th>
                  <th className="py-3 px-4">Salary Setup</th>
                  <th className="py-3 px-4">Bank Details</th>
                  <th className="py-3 px-4 text-center">Payroll Options</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{emp.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {emp.position} {emp.phone ? `· ${emp.phone}` : ''}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {emp.startDate || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 font-mono">
                        {formatCurrency(emp.baseSalary, symbol)}{' '}
                        <span className="text-[10px] font-sans font-normal text-slate-500 capitalize">
                          / {emp.salaryType}
                        </span>
                      </div>
                      {emp.commissionEnabled && (
                        <span className="text-[10px] text-indigo-700 font-semibold">
                          +{emp.commissionRatePercent || 0}% Commission
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {emp.bankName || emp.accountNumber ? (
                        <div>
                          <div className="font-medium text-slate-800">{emp.bankName}</div>
                          <div className="font-mono text-[11px] text-slate-500">
                            {emp.accountNumber} · {emp.accountName}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Not provided</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center space-x-1">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          emp.includeInPayroll
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {emp.includeInPayroll ? 'In Payroll' : 'Excluded'}
                      </span>
                      {emp.enablePayeTax && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          7% PAYE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          emp.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {emp.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEditModal(emp)}
                        className="px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onSaveEmployee({
                            ...emp,
                            status: emp.status === 'active' ? 'inactive' : 'active',
                            updatedAt: new Date().toISOString(),
                          })
                        }
                        className="px-2 py-1 rounded border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-800 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{emp.status === 'active' ? 'Deactivate' : 'Activate'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete employee "${emp.fullName}" from payroll?`
                            )
                          ) {
                            void onDeleteEmployee(emp.id);
                          }
                        }}
                        className="px-2 py-1 rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Employee Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl border border-slate-200 my-8"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingEmployee ? `Edit Employee · ${editingEmployee.fullName}` : 'Add New Employee'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Optional Link to Existing Shop Staff */}
            {!editingEmployee && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 underline decoration-slate-300">
                    Select Staff Member
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Optional — pre-fills name &amp; role
                  </span>
                </div>
                <input
                  type="text"
                  value={staffSearchQuery}
                  onChange={(e) => setStaffSearchQuery(e.target.value)}
                  placeholder="Search shop staff by name..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                />
                {staffSearchQuery.trim() && matchingStaffUsers.length > 0 && (
                  <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-32 overflow-y-auto bg-white shadow-sm">
                    {matchingStaffUsers.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectStaffUser(u)}
                        className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-semibold text-slate-900">{u.fullName}</span>
                        <span className="text-slate-500">{u.roleLabel}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Basic Information */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1">
                Basic Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Amina Bello"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 08012345678"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Role / Position *
                  </label>
                  <input
                    type="text"
                    required
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. Sales Manager / Bartender"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Start Date (Resumption Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Salary Setup */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1">
                Salary Setup
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Salary Type
                  </label>
                  <select
                    value={salaryType}
                    onChange={(e) => setSalaryType(e.target.value as SalaryType)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="daily">Daily</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Base Salary ({symbol}) *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    placeholder="e.g. 80000"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-700 font-medium">
                  Commission Enabled
                </span>
                <div className="flex items-center gap-3">
                  {commissionEnabled && (
                    <div className="flex items-center gap-1 text-xs">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={commissionRatePercent}
                        onChange={(e) => setCommissionRatePercent(e.target.value)}
                        className="w-16 px-2 py-1 border border-slate-300 rounded text-center font-mono"
                      />
                      <span className="text-slate-500">%</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setCommissionEnabled(!commissionEnabled)}
                    className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${
                      commissionEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                        commissionEnabled ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Bank Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Bank Details</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="e.g. Access Bank"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="e.g. 3012345678"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="Account holder name"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Payroll Options */}
            <div className="space-y-2.5 pt-1">
              <h4 className="text-xs font-bold text-slate-700 border-b border-slate-100 pb-1">
                Payroll Options
              </h4>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700 font-medium">
                  Include in Payroll Runs
                </span>
                <button
                  type="button"
                  onClick={() => setIncludeInPayroll(!includeInPayroll)}
                  className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${
                    includeInPayroll ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                      includeInPayroll ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700 font-medium">
                  Enable Tax (7% PAYE)
                </span>
                <button
                  type="button"
                  onClick={() => setEnablePayeTax(!enablePayeTax)}
                  className={`w-10 h-5 rounded-full transition-colors cursor-pointer relative ${
                    enablePayeTax ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white shadow transform transition-transform ${
                      enablePayeTax ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isSaving
                  ? 'Saving...'
                  : editingEmployee
                  ? 'Save Changes'
                  : 'Save Employee'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
