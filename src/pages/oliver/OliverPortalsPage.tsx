import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { OliverServiceLayout } from './OliverServiceLayout';

interface OliverPortalsPageProps {
  service: PortalService;
  status: ServiceStatus;
}

export function OliverPortalsPage({ service, status }: OliverPortalsPageProps) {
  const customerUrl = import.meta.env.VITE_OLIVER_CUSTOMER_URL || '';
  const employeeUrl = import.meta.env.VITE_OLIVER_EMPLOYEE_URL || '';

  return (
    <OliverServiceLayout service={service} status={status}>
      <div className="grid gap-6 md:grid-cols-2">
        {/* Customer Portal */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="8" r="3" />
                <path d="M5.5 19c.8-2.6 3-4.3 6.5-4.3s5.7 1.7 6.5 4.3" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Customer Portal</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Your customers can view job status, accept or decline quotes, view invoices, and pay
            online through this tenant-branded portal.
          </p>
          {status === 'enabled' && customerUrl ? (
            <a
              href={customerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Open Customer Portal
            </a>
          ) : (
            <span className="text-xs text-slate-400">
              {status !== 'enabled' ? 'Available when OLIVER is enabled' : 'Portal URL not configured'}
            </span>
          )}
        </div>

        {/* Employee Portal */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M8 10h8M8 14h5" strokeLinecap="round" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Employee Portal</h2>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Your team members and contractors can view their schedule, accept or decline job offers,
            submit proof-of-work, and manage their assignments.
          </p>
          {status === 'enabled' && employeeUrl ? (
            <a
              href={employeeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Open Employee Portal
            </a>
          ) : (
            <span className="text-xs text-slate-400">
              {status !== 'enabled' ? 'Available when OLIVER is enabled' : 'Portal URL not configured'}
            </span>
          )}
        </div>
      </div>
    </OliverServiceLayout>
  );
}
