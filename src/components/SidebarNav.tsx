import { NavLink, useLocation } from 'react-router-dom';
import { LAYER_LABELS, SERVICE_CATALOG, resolveServiceStatus, type PortalService } from '../config/serviceCatalog';
import { useAppState } from '../app/AppState';

function statusBadge(status: string) {
  if (status === 'enabled') return 'Enabled';
  if (status === 'not_subscribed') return 'Sign up';
  return 'Coming soon';
}

export function SidebarNav() {
  const { enabledServices } = useAppState();
  const location = useLocation();

  const overview = SERVICE_CATALOG.find((s) => s.key === 'portal_overview');
  const bySection = SERVICE_CATALOG.filter((s) => s.section !== 'Shared').reduce<Record<string, PortalService[]>>(
    (acc, svc) => {
      (acc[svc.section] ??= []).push(svc);
      return acc;
    },
    {}
  );

  const sectionOrder: PortalService['section'][] = ['ARION', 'STELLA', 'OLIVER', 'LUMEN', 'FORGE', 'ARGUS'];

  return (
    <nav className="iadm-sidebar">
      <div className="iadm-sidebar-inner">
        <div className="iadm-nav-title">Navigation</div>
      <ul className="space-y-1">
        {overview ? (
          <li key={overview.key}>
            <NavLink
              to={overview.route}
              className={({ isActive }) =>
                `iadm-nav-item ${isActive ? 'iadm-nav-item-active' : ''}`
              }
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate">{overview.displayName}</span>
              </span>
              <span className="iadm-badge iadm-badge-enabled">Enabled</span>
            </NavLink>
          </li>
        ) : null}

        <li className="my-3 border-t border-white/10" aria-hidden="true" />

        {sectionOrder.map((section) => {
          const items = bySection[section] ?? [];
          if (items.length === 0) return null;

          const isSectionActive = items.some((i) => location.pathname === i.route);

          return (
            <li key={section}>
              <details className="group" open={isSectionActive}>
                <summary className="cursor-pointer list-none rounded-md px-2 py-2 text-sm font-medium text-white/90 hover:bg-white/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{LAYER_LABELS[section]}</span>
                    <span className="text-xs text-white/50 group-open:rotate-90" aria-hidden="true">
                      ▸
                    </span>
                  </div>
                </summary>

                <ul className="mt-1 space-y-1 pl-2">
                  {items.map((svc) => {
                    const status = resolveServiceStatus(svc, enabledServices);
                    return (
                      <li key={svc.key}>
                        <NavLink
                          to={svc.route}
                          className={({ isActive }) =>
                            `iadm-nav-item ${isActive ? 'iadm-nav-item-active' : ''}`
                          }
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">{svc.displayName}</span>
                            <span className="block truncate text-xs text-white/60">{statusBadge(status)}</span>
                          </span>
                          <span
                            className={`iadm-badge ${status === 'enabled' ? 'iadm-badge-enabled' : 'iadm-badge-soon'}`}
                          >
                            {statusBadge(status)}
                          </span>
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
      </div>
    </nav>
  );
}
