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
  // Brand-aligned status colors for nav dots:
  // - enabled        → IADM orange
  // - not_subscribed → IADM dark blue
  // - coming_soon    → IADM light gray
  switch (status) {
    case 'enabled':
      return 'bg-[rgb(var(--iadm-orange))]';
    case 'not_subscribed':
      return 'bg-[rgb(var(--iadm-dark-blue))]';
    case 'coming_soon':
    default:
      return 'bg-[rgb(var(--iadm-light-gray))]';
  }
}

function navItemClasses(isActive: boolean): string {
  const base =
    'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors border-b-2 border-transparent';

  if (isActive) {
    return [
      base,
      'text-[rgb(var(--iadm-dark-blue))]',
      'font-semibold',
      'border-[rgb(var(--iadm-orange))]',
      'bg-transparent'
    ].join(' ');
  }

  return [
    base,
    'text-slate-900',
    'hover:bg-white/60',
    'hover:text-[rgb(var(--iadm-dark-blue))]'
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
    <nav className="flex h-full flex-col bg-[rgb(var(--iadm-light-blue))] text-slate-900 border-r border-slate-200">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-4">
          {overview && (
            <li>
              <NavLink to={overview.route} className={({ isActive }) => navItemClasses(isActive)}>
                {/* Overview dot is always “enabled” / accessible */}
                <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[rgb(var(--iadm-orange))]" />
                <span className="truncate">{overview.displayName}</span>
              </NavLink>
            </li>
          )}

          {sectionOrder.map((section) => {
            const services = sections[section];
            if (!services || services.length === 0) return null;

            return (
              <li key={section}>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
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