import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Play,
  CheckCircle2,
  Printer,
  Download,
  Trash2,
  X,
  Banknote,
} from 'lucide-react';
import {
  Business,
  PayrollEmployee,
  PayrollLineItem,
  PayrollPeriod,
  Shop,
  User,
} from '../types/pos';
import { formatCurrency } from '../utils/posCalculations';

interface PayrollPaymentsPageProps {
  business: Business;
  shop: Shop;
  currentUser: User;
  employees: PayrollEmployee[];
  payrollPeriods: PayrollPeriod[];
  onSavePeriod: (period: PayrollPeriod) => Promise<void> | void;
  onDeletePeriod: (periodId: string) => Promise<void> | void;
  onNavigateToEmployees: () => void;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString('en-NG', {
    month: 'long',
    year: 'numeric',
  });
}

function recalcPeriodTotals(items: PayrollLineItem[]) {
  let totalGrossPay = 0;
  let totalTaxDeduction = 0;
  let totalNetPay = 0;
  for (const item of items) {
    totalGrossPay += item.baseSalary + item.commissionBonus + item.otherAllowances;
    totalTaxDeduction += item.taxDeduction;
    totalNetPay += item.netPay;
  }
  return { totalGrossPay, totalTaxDeduction, totalNetPay };
}

export const PayrollPaymentsPage: React.FC<PayrollPaymentsPageProps> = ({
  business,
  shop,
  currentUser,
  employees,
  payrollPeriods,
  onSavePeriod,
  onDeletePeriod,
  onNavigateToEmployees,
}) => {
  const symbol = business.currencySymbol || '₦';
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonthKey());
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const activePayrollEmployees = useMemo(
    () =>
      employees.filter(
        (e) =>
          e.shopId === shop.id &&
          e.businessId === business.id &&
          e.status === 'active' &&
          e.includeInPayroll
      ),
    [employees, shop.id, business.id]
  );

  const estimatedPayroll = useMemo(
    () =>
      activePayrollEmployees.reduce((sum, e) => {
        const paye = e.enablePayeTax ? (e.baseSalary * (e.payeRatePercent ?? 7)) / 100 : 0;
        return sum + Math.max(0, e.baseSalary - paye);
      }, 0),
    [activePayrollEmployees]
  );

  const shopPeriods = useMemo(
    () =>
      payrollPeriods
        .filter((p) => p.shopId === shop.id && p.businessId === business.id)
        .sort((a, b) => b.monthKey.localeCompare(a.monthKey)),
    [payrollPeriods, shop.id, business.id]
  );

  const activePeriod = useMemo(
    () =>
      shopPeriods.find((p) => p.id === selectedPeriodId) || shopPeriods[0] || null,
    [shopPeriods, selectedPeriodId]
  );

  const handleRunPayroll = async () => {
    if (activePayrollEmployees.length === 0) return;

    const existingForMonth = shopPeriods.find((p) => p.monthKey === selectedMonth);
    if (existingForMonth) {
      setSelectedPeriodId(existingForMonth.id);
      setBanner(`Opened existing payroll period for ${existingForMonth.monthLabel}.`);
      return;
    }

    setIsRunning(true);
    try {
      const items: PayrollLineItem[] = activePayrollEmployees.map((emp) => {
        const gross = emp.baseSalary;
        const tax = emp.enablePayeTax
          ? Math.round(((gross * (emp.payeRatePercent ?? 7)) / 100) * 100) / 100
          : 0;
        const net = Math.max(0, gross - tax);
        return {
          employeeId: emp.id,
          employeeName: emp.fullName,
          position: emp.position,
          bankName: emp.bankName,
          accountNumber: emp.accountNumber,
          accountName: emp.accountName,
          baseSalary: emp.baseSalary,
          commissionBonus: 0,
          otherAllowances: 0,
          taxDeduction: tax,
          otherDeductions: 0,
          netPay: net,
          paymentStatus: 'pending',
        };
      });

      const totals = recalcPeriodTotals(items);
      const nowIso = new Date().toISOString();
      const newPeriod: PayrollPeriod = {
        id: `pay-${shop.id}-${selectedMonth}-${Date.now()}`,
        businessId: business.id,
        shopId: shop.id,
        monthKey: selectedMonth,
        monthLabel: formatMonthLabel(selectedMonth),
        status: 'draft',
        items,
        ...totals,
        createdByUserId: currentUser.id,
        createdByName: currentUser.fullName,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      await onSavePeriod(newPeriod);
      setSelectedPeriodId(newPeriod.id);
      setBanner(`Created payroll run for ${newPeriod.monthLabel} with ${items.length} employee(s).`);
    } finally {
      setIsRunning(false);
    }
  };

  const handleUpdateLineItem = async (
    period: PayrollPeriod,
    employeeId: string,
    updates: Partial<PayrollLineItem>
  ) => {
    const emp = activePayrollEmployees.find((e) => e.id === employeeId);
    const updatedItems = period.items.map((item) => {
      if (item.employeeId !== employeeId) return item;
      const merged = { ...item, ...updates };
      const gross = merged.baseSalary + merged.commissionBonus + merged.otherAllowances;
      const paye = emp?.enablePayeTax
        ? Math.round(((gross * (emp.payeRatePercent ?? 7)) / 100) * 100) / 100
        : merged.taxDeduction;
      merged.taxDeduction = paye;
      merged.netPay = Math.max(0, gross - paye - merged.otherDeductions);
      return merged;
    });

    const totals = recalcPeriodTotals(updatedItems);
    const allPaid = updatedItems.every((i) => i.paymentStatus === 'paid');
    await onSavePeriod({
      ...period,
      items: updatedItems,
      status: allPaid ? 'finalized' : 'draft',
      ...totals,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleExportScheduleCsv = (period: PayrollPeriod) => {
    const headers = [
      'Employee Name',
      'Position',
      'Bank Name',
      'Account Number',
      'Account Name',
      'Base Salary',
      'Bonus / Commission',
      'PAYE Tax',
      'Deductions',
      'Net Pay',
      'Status',
    ];
    const rows = period.items.map((i) => [
      i.employeeName,
      i.position,
      i.bankName,
      i.accountNumber ? `="${i.accountNumber}"` : '',
      i.accountName,
      i.baseSalary,
      i.commissionBonus,
      i.taxDeduction,
      i.otherDeductions,
      i.netPay,
      i.paymentStatus,
    ]);
    const csv =
      '\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${shop.code}-${period.monthKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPayslip = (period: PayrollPeriod, item: PayrollLineItem) => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Payslip - ${item.employeeName}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #000; padding: 24px; max-width: 520px; margin: 0 auto; }
    h2, h3 { margin: 0 0 6px 0; }
    .meta { font-size: 12px; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 12px 0; }
    td { padding: 6px 0; border-bottom: 1px dashed #ccc; }
    .right { text-align: right; font-weight: bold; }
    .net { font-size: 16px; font-weight: bold; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 10px 0; }
  </style>
</head>
<body>
  <h2>${business.name} — ${shop.name}</h2>
  <h3>Employee Payslip (${period.monthLabel})</h3>
  <div class="meta">
    <div><strong>Employee:</strong> ${item.employeeName} (${item.position})</div>
    <div><strong>Bank:</strong> ${item.bankName || '—'} · ${item.accountNumber || '—'}</div>
    <div><strong>Status:</strong> ${item.paymentStatus.toUpperCase()}</div>
  </div>
  <table>
    <tr><td>Base Salary</td><td class="right">${formatCurrency(item.baseSalary, symbol)}</td></tr>
    <tr><td>Commission / Bonus</td><td class="right">${formatCurrency(item.commissionBonus, symbol)}</td></tr>
    <tr><td>PAYE Tax Deduction</td><td class="right">-${formatCurrency(item.taxDeduction, symbol)}</td></tr>
    <tr><td>Other Deductions</td><td class="right">-${formatCurrency(item.otherDeductions, symbol)}</td></tr>
    <tr class="net"><td>NET PAY</td><td class="right">${formatCurrency(item.netPay, symbol)}</td></tr>
  </table>
</body>
</html>`;
    const w = window.open('', '_blank', 'width=560,height=600');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      setTimeout(() => {
        w.focus();
        w.print();
      }, 250);
    }
  };

  return (
    <div className="space-y-5">
      {/* KPI Summary Cards */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-5">
        <div>
          <h2 className="text-lg font-display font-bold text-slate-900">
            Salary Payments · {shop.name} ({shop.code})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Run monthly payroll periods, review PAYE deductions &amp; bonuses, and mark salaries as paid.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">Employees</span>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1">
              {activePayrollEmployees.length}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">Estimated Payroll</span>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1 font-mono">
              {formatCurrency(estimatedPayroll, symbol)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs text-slate-500 font-medium">Total Periods</span>
            <p className="text-2xl font-display font-bold text-slate-900 mt-1">
              {shopPeriods.length}
            </p>
          </div>
        </div>

        {/* Run Payroll Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
            <span>Select Month:</span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white"
            />
          </div>

          <button
            type="button"
            disabled={activePayrollEmployees.length === 0 || isRunning}
            onClick={handleRunPayroll}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isRunning ? 'Running...' : 'Run Payroll'}</span>
          </button>

          {activePayrollEmployees.length === 0 && (
            <span className="text-xs text-rose-500 font-medium">
              No active employees.{' '}
              <button
                type="button"
                onClick={onNavigateToEmployees}
                className="underline font-semibold hover:text-rose-700 cursor-pointer"
              >
                Add employees first.
              </button>
            </span>
          )}
        </div>
      </div>

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

      {/* Period Selector & Details */}
      {shopPeriods.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center space-y-2 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-800">No Salary Periods Yet</p>
          <p className="text-xs text-slate-500">
            Select a month and click <strong>Run Payroll</strong> to create your first payroll period.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Period Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {shopPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPeriodId(p.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 flex items-center gap-2 ${
                  activePeriod?.id === p.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{p.monthLabel}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                    p.status === 'finalized'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-600'
                  }`}
                >
                  {p.status === 'finalized' ? 'Paid' : 'Pending'}
                </span>
              </button>
            ))}
          </div>

          {/* Active Period Table */}
          {activePeriod && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {activePeriod.monthLabel} Payroll Sheet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Total Net Pay:{' '}
                    <strong className="text-emerald-700 font-mono">
                      {formatCurrency(activePeriod.totalNetPay, symbol)}
                    </strong>{' '}
                    · Tax Deducted:{' '}
                    <span className="font-mono">
                      {formatCurrency(activePeriod.totalTaxDeduction, symbol)}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportScheduleCsv(activePeriod)}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export Schedule CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete payroll period "${activePeriod.monthLabel}"?`
                        )
                      ) {
                        void onDeletePeriod(activePeriod.id);
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Employee &amp; Bank</th>
                      <th className="py-3 px-4 text-right">Base Salary</th>
                      <th className="py-3 px-4 text-right">Bonus ({symbol})</th>
                      <th className="py-3 px-4 text-right">PAYE Tax</th>
                      <th className="py-3 px-4 text-right">Deductions ({symbol})</th>
                      <th className="py-3 px-4 text-right">Net Pay</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {activePeriod.items.map((item) => (
                      <tr key={item.employeeId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-900">{item.employeeName}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.position}
                            {item.bankName ? ` · ${item.bankName} (${item.accountNumber})` : ''}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {formatCurrency(item.baseSalary, symbol)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={item.paymentStatus === 'paid'}
                            value={item.commissionBonus}
                            onChange={(e) =>
                              void handleUpdateLineItem(activePeriod, item.employeeId, {
                                commissionBonus: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                            className="w-20 px-2 py-1 border border-slate-200 rounded text-right font-mono text-xs disabled:bg-slate-50"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-700">
                          -{formatCurrency(item.taxDeduction, symbol)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <input
                            type="number"
                            min={0}
                            disabled={item.paymentStatus === 'paid'}
                            value={item.otherDeductions}
                            onChange={(e) =>
                              void handleUpdateLineItem(activePeriod, item.employeeId, {
                                otherDeductions: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                            className="w-20 px-2 py-1 border border-slate-200 rounded text-right font-mono text-xs disabled:bg-slate-50"
                          />
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(item.netPay, symbol)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              item.paymentStatus === 'paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {item.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                          {item.paymentStatus === 'pending' ? (
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateLineItem(activePeriod, item.employeeId, {
                                  paymentStatus: 'paid',
                                  paymentMethod: 'bank_transfer',
                                  paidAt: new Date().toISOString(),
                                })
                              }
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Banknote className="w-3.5 h-3.5" />
                              <span>Mark Paid</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void handleUpdateLineItem(activePeriod, item.employeeId, {
                                  paymentStatus: 'pending',
                                })
                              }
                              className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-600 text-[11px] cursor-pointer"
                            >
                              Undo
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrintPayslip(activePeriod, item)}
                            title="Print Payslip"
                            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 inline-flex items-center cursor-pointer"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
