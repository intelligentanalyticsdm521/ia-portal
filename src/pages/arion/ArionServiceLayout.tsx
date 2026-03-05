import type { PropsWithChildren } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';

export function ArionServiceLayout({
  service,
  status,
  loading,
  error,
  onRefresh,
  children
}: PropsWithChildren<{
  service: PortalService;
  status: ServiceStatus;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
}>) {
  const { active } = useAppState();
  const tenantName = active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'your tenant';

  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{service.displayName}</h1>
            <p className="mt-1 text-sm text-gray-600">{service.description}</p>
            <p className="mt-2 text-xs text-gray-500">
              Tenant: <span className="font-medium">{tenantName}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {status.replace('_', ' ')}
            </span>
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Refresh
              </button>
            )}
          </div>
        </div>
      </section>

      {error && (
        <section className="iadm-card border-red-200">
          <div className="iadm-card-body">
            <h2 className="text-sm font-semibold text-red-700">ARION data error</h2>
            <p className="mt-2 text-sm text-red-600">{error}</p>
          </div>
        </section>
      )}

      {loading ? (
        <section className="iadm-card">
          <div className="iadm-card-body">
            <div className="text-sm font-medium text-slate-900">Loading ARION data…</div>
            <div className="mt-2 text-sm text-slate-500">
              Pulling your website, domain, hosting, and reporting details.
            </div>
          </div>
        </section>
      ) : (
        children
      )}
    </div>
  );
}

export function ArionEmptyState({
  title,
  body
}: {
  title: string;
  body: string;
}) {
  return (
    <section className="iadm-card">
      <div className="iadm-card-body text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600">{body}</p>
      </div>
    </section>
  );
}

export function SummaryCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="iadm-card">
      <div className="iadm-card-body">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
        {helper && <div className="mt-1 text-xs text-slate-500">{helper}</div>}
      </div>
    </div>
  );
}
