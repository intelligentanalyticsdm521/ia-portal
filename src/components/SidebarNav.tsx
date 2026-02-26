import { NavLink } from 'react-router-dom';
import { useAppState } from '../app/AppState';
import {
  LAYER_LABELS,
  SERVICE_CATALOG,
  resolveServiceStatus,
  type PortalService,
  type ServiceStatus
} from '../config/serviceCatalog';

function statusDotClasses(status: ServiceStatus): string {
  switch (status) {
    case 'enabled':
      return 'bg-iadm-orange';       // Accessible
    case 'not_subscribed':
      return 'bg-iadm-darkBlue';     // In production, not subscribed
    case 'coming_soon':
    default:
      return 'bg-iadm-lightGray';    // Not in production yet
  }
}

function navItemClasses(isActive: boolean): string {
  return [
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
    isActive
      ? 'bg-iadm-darkBlue text-white'
      : 'text-slate-100 hover:bg-slate-800 hover:text-white'
  ].join(' ');
}

export function SidebarNav() {
  const { enabledServices } = useAppState();

  const overview = SERVICE_CATALOG.find((s) => s.key === 'portal_overview') ?? null;

  const sections = SERVICE_CATALOG.filter((s) => s.section !== 'Shared').reduce<
    Record<PortalService['section'], PortalService[]>
  >((acc, service) => {
    (acc[service.section] ??= []).push(service);
    return acc;
  }, {} as Record<PortalService['section'], PortalService[]>);

  const sectionOrder: PortalService['section'][] = [
    'ARION',
    'STELLA',
    'OLIVER',
    'SPARK',
    'FORGE',
    'ARGUS'
  ];

  const orderedSections = sectionOrder.filter((section) => sections[section]?.length);

  return (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex-1 overflow-y-auto px-3 py-4 text-xs">
        <div className="mb-6">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Navigation
          </p>
          <ul className="space-y-1">
            {overview && (
              <li>
                <NavLink
                  to={overview.path}
                  className={({ isActive }) => navItemClasses(isActive)}
                  end
                >
                  <span className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-iadm-orange" />
                  <span className="flex-1 truncate">{overview.displayName}</span>
                </NavLink>
              </li>
            )}
          </ul>
        </div>

        <ul className="space-y-4">
          {orderedSections.map((sectionKey) => {
            const sectionServices = sections[sectionKey] ?? [];
            const label = LAYER_LABELS[sectionKey];

            return (
              <li key={sectionKey}>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <ul className="space-y-0.5">
                  {sectionServices.map((service) => {
                    const status = resolveServiceStatus(service, enabledServices);

                    return (
                      <li key={service.key}>
                        <NavLink
                          to={service.path}
                          className={({ isActive }) => navItemClasses(isActive)}
                        >
                          <span
                            className={[
                              'inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full',
                              statusDotClasses(status)
                            ].join(' ')}
                          />
                          <span className="truncate">{service.displayName}</span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}