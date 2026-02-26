import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import {
  SERVICE_CATALOG,
  resolveServiceStatus,
  type PortalService,
  type ServiceStatus
} from '../config/serviceCatalog';
import { SparkOverviewPage } from './spark/SparkOverviewPage';
import { SparkCrmPage } from './spark/SparkCrmPage';
import { SparkCampaignsPage } from './spark/SparkCampaignsPage';
import { SparkLeadsPage } from './spark/SparkLeadsPage';

export function ServiceRouter() {
  const { serviceKey } = useParams<{ serviceKey: string }>();
  const { enabledServices } = useAppState();

  const service: PortalService | null = useMemo(
    () => SERVICE_CATALOG.find((s) => s.key === serviceKey) ?? null,
    [serviceKey]
  );

  if (!service) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-slate-900">Service not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t find that service in your portal. Try using the navigation to choose a
          different area.
        </p>
      </div>
    );
  }

  const status: ServiceStatus = resolveServiceStatus(service, enabledServices);

  // LUMEN / SPARK services get their own read-only presentation pages.
  if (service.section === 'LUMEN') {
    switch (service.key) {
      case 'lumen_overview':
        return <SparkOverviewPage service={service} status={status} />;
      case 'lumen_contacts':
        return <SparkCrmPage service={service} status={status} />;
      case 'lumen_campaigns':
        return <SparkCampaignsPage service={service} status={status} />;
      case 'lumen_leads':
        return <SparkLeadsPage service={service} status={status} />;
      default:
        break;
    }
  }

  // All other services use a generic placeholder shell with state-aware messaging.
  return <GenericServicePage service={service} status={status} />;
}

interface GenericProps {
  service: PortalService;
  status: ServiceStatus;
}

function GenericServicePage({ service, status }: GenericProps) {
  const title =
    status === 'coming_soon'
      ? 'Coming soon'
      : status === 'not_subscribed'
      ? 'Not subscribed yet'
      : service.displayName;

  const body =
    status === 'coming_soon'
      ? 'This surface is planned but not available yet in your portal. As new modules are released, they will light up here automatically.'
      : status === 'not_subscribed'
      ? 'This feature is available for SPARK / IADM clients but has not been added to your subscription yet.'
      : 'This area will surface read-only views from the underlying service once the module is implemented.';

  return (
    <div className="flex flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{service.displayName}</h1>
        <p className="mt-1 text-sm text-slate-600">{service.description}</p>
      </div>

      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{body}</p>
      </div>
    </div>
  );
}