import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { SERVICE_CATALOG, resolveServiceStatus } from '../config/serviceCatalog';
import { useAppState } from '../app/AppState';
import { EnabledServicePage } from './templates/EnabledServicePage';
import { NotSubscribedPage } from './templates/NotSubscribedPage';
import { ComingSoonPage } from './templates/ComingSoonPage';

export function ServiceRouter() {
  const { serviceKey } = useParams();
  const { enabledServices } = useAppState();

  const svc = useMemo(() => SERVICE_CATALOG.find((s) => s.key === serviceKey) || null, [serviceKey]);

  if (!svc) {
    return (
      <div className="rounded-lg border bg-white p-5">
        <h1 className="text-xl font-semibold">Service not found</h1>
        <p className="mt-2 text-sm text-gray-600">The requested service key does not exist in the portal catalog.</p>
      </div>
    );
  }

  const status = resolveServiceStatus(svc, enabledServices);

  if (status === 'enabled') return <EnabledServicePage service={svc} />;
  if (status === 'not_subscribed') return <NotSubscribedPage service={svc} />;
  return <ComingSoonPage service={svc} />;
}
