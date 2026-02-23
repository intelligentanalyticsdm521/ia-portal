import { Link } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import { SERVICE_CATALOG, resolveServiceStatus } from '../config/serviceCatalog';

export function OverviewPage() {
  const { active, enabledServices } = useAppState();

  const quickLinks = SERVICE_CATALOG.filter((s) => s.key !== 'portal_overview')
    .map((s) => ({ svc: s, status: resolveServiceStatus(s, enabledServices) }))
    .slice(0, 4);

  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body">
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="mt-2 text-sm text-gray-600">
          Tenant: <span className="font-medium">{active?.tenant?.tenantFullName}</span>
        </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {quickLinks.map(({ svc, status }) => (
          <Link
            key={svc.key}
            to={svc.route}
            className="iadm-card hover:bg-gray-50"
          >
            <div className="iadm-card-body">
              <div className="text-sm font-medium">{svc.displayName}</div>
              <div className="mt-1 text-sm text-gray-600">{svc.description}</div>
              <div className="mt-3 text-xs text-gray-500">Status: {status.replace('_', ' ')}</div>
            </div>
          </Link>
        ))}
      </section>

      <section className="iadm-card">
        <div className="iadm-card-body">
          <h2 className="text-base font-semibold">Need a new service?</h2>
          <p className="mt-2 text-sm text-gray-700">
            Contact <span className="font-medium">info@intelligentanalyticsdm.com</span> to request setup.
          </p>
        </div>
      </section>
    </div>
  );
}
