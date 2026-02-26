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
      return 'bg-emerald-400';
    case 'not_subscribed':
      return 'bg-amber-400';
    case 'coming_soon':
    default:
      return 'bg-slate-500';
  }
}

function navItemClasses(isActive: boolean): string {
  return [
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
    isActive ? 'bg-sky-900 text-white' : 'text-slate-100 hover:bg-slate-800 hover:text-white'
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
    'LUMEN',
    'FORGE',
    'ARGUS'
  ];

  return (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-100">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-4">
          {overview && (
            <li>
              <NavLink to={overview.route} className={({ isActive }) => navItemClasses(isActive)}>
                <span className="truncate">{overview.displayName}</span>
              </NavLink>
            </li>
          )}

          {sectionOrder.map((section) => {
            const services = sections[section];
            if (!services || services.length === 0) return null;

            return (
              <li key={section}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {LAYER_LABELS[section]}
                </div>
                <ul className="space-y-0.5">
                  {services.map((service) => {
                    const status = resolveServiceStatus(service, enabledServices);
                    return (
                      <li key={service.key}>
                        <NavLink
                          to={service.route}
                          className={({ isActive }) => navItemClasses(isActive)}
                        >
                          <span
                            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClasses(
                              status
                            )}`}
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