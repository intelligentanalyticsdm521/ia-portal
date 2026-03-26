import type { PropsWithChildren } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import { useAppState } from '../../app/AppState';

type OliverServiceLayoutProps = PropsWithChildren<{
  service: PortalService;
  status: ServiceStatus;
}>;

export function OliverServiceLayout({ service, status, children }: OliverServiceLayoutProps) {
  const { active } = useAppState();
  const tenantName = active?.tenant?.tenantFullName || active?.tenant?.tenantName || 'your tenant';

  const handleOpenOliver = () => {
    const target = import.meta.env.VITE_OLIVER_OPS_URL;
    if (target) {
      window.location.href = target;
    } else {
      alert('OLIVER app URL is not configured (VITE_OLIVER_OPS_URL). Please contact support.');
    }
  };

  const showOverlay = status === 'coming_soon' || status === 'not_subscribed';

  return (
    <div className="relative">
      <div className="px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{service.displayName}</h1>
            <p className="mt-1 text-sm text-gray-600">
              OLIVER — Operations Platform for{' '}
              <span className="font-medium">{tenantName}</span>.
            </p>
          </div>
          {status === 'enabled' && (
            <button
              type="button"
              onClick={handleOpenOliver}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              Open OLIVER Platform
            </button>
          )}
        </div>
        {children}
      </div>

      {showOverlay && <OliverUpsellOverlay status={status} service={service} />}
    </div>
  );
}

function OliverUpsellOverlay({ status, service }: { status: ServiceStatus; service: PortalService }) {
  if (status === 'coming_soon') {
    return (
      <div className="iadm-upsell-backdrop">
        <div className="iadm-upsell-card text-center">
          <h2 className="iadm-upsell-title">{service.displayName} is coming soon</h2>
          <p className="iadm-upsell-subtitle">
            This section is a placeholder for upcoming OLIVER — Operations Platform capabilities.
            Once OLIVER is launched for your account you&apos;ll see live job, scheduling, and
            invoicing data here.
          </p>
        </div>
      </div>
    );
  }

  const features = [
    { title: 'Job Lifecycle', description: 'Manage jobs from inquiry through completion and payment.' },
    { title: 'Scheduling & Dispatch', description: 'Calendar views, crew assignment, and job offers.' },
    { title: 'Quotes & Invoices', description: 'Create quotes, send invoices, collect payments via Stripe.' },
    { title: 'Customer Portal', description: 'Branded portal for job status, quotes, and online payment.' },
    { title: 'Employee Portal', description: 'Mobile-first schedule, proof-of-work, and job management.' },
    { title: 'Reporting', description: 'Revenue, completion rates, and crew performance insights.' },
  ];

  return (
    <div className="iadm-upsell-backdrop">
      <div className="iadm-upsell-card">
        <h2 className="iadm-upsell-title">
          <span>Run Your Field Operations with </span>
          <span className="iadm-upsell-title-highlight">OLIVER</span>
        </h2>
        <p className="iadm-upsell-subtitle">
          From <span className="font-semibold">first inquiry</span> to{' '}
          <span className="font-semibold">final payment</span>, OLIVER gives you a complete
          field service platform — scheduling, dispatch, proof-of-work, invoicing, and customer
          portals — all integrated with your Intelligent Analytics suite.
        </p>
        <div className="iadm-upsell-divider" />
        <div className="iadm-upsell-feature-grid">
          {features.map((f) => (
            <div key={f.title} className="iadm-upsell-feature-row">
              <div className="iadm-upsell-feature-icon">
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
                </svg>
              </div>
              <div>
                <div className="iadm-upsell-feature-title">{f.title}</div>
                <div className="iadm-upsell-feature-text">{f.description}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
