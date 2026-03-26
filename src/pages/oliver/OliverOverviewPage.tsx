import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { OliverServiceLayout } from './OliverServiceLayout';

interface OliverOverviewPageProps {
  service: PortalService;
  status: ServiceStatus;
}

export function OliverOverviewPage({ service, status }: OliverOverviewPageProps) {
  return (
    <OliverServiceLayout service={service} status={status}>
      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active Jobs" value="0" helper="Jobs in progress or scheduled" />
        <StatCard label="Revenue This Month" value="$0.00" helper="Paid invoices this month" />
        <StatCard label="Open Invoices" value="0" helper="Invoices awaiting payment" />
        <StatCard label="Completion Rate" value="0%" helper="Jobs completed vs created" />
      </div>

      {/* Recent jobs + quick actions */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Recent Jobs</h2>
            <span className="text-xs text-slate-500">Last 30 days</span>
          </div>
          <table className="min-w-full text-left text-xs text-slate-600">
            <thead>
              <tr>
                <th className="py-2 pr-3 font-semibold">Job #</th>
                <th className="py-2 pr-3 font-semibold">Title</th>
                <th className="py-2 pr-3 font-semibold">Status</th>
                <th className="py-2 pr-3 font-semibold text-right">Created</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-dashed border-slate-200">
                <td className="py-3 pr-3 text-slate-400" colSpan={4}>
                  No jobs yet. Create your first job in OLIVER to see activity here.
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            <QuickAction label="Create Job" disabled={status !== 'enabled'} />
            <QuickAction label="Create Quote" disabled={status !== 'enabled'} />
            <QuickAction label="View Schedule" disabled={status !== 'enabled'} />
          </div>
        </div>
      </div>
    </OliverServiceLayout>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-2 text-xl font-semibold text-slate-900">{value}</div>
      {helper && <div className="mt-1 text-xs text-slate-500">{helper}</div>}
    </div>
  );
}

function QuickAction({ label, disabled }: { label: string; disabled: boolean }) {
  const handleClick = () => {
    const target = import.meta.env.VITE_OLIVER_OPS_URL;
    if (target) window.location.href = target;
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
