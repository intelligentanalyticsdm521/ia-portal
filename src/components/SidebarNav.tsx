import { NavLink } from "react-router-dom";
import { useEnabledServices } from "../hooks/useEnabledServices";
import { LEADGEN_LOCKED_KEYS } from "../config/featureFlags";
import { useLeadgenAccess } from "../hooks/useLeadgenAccess";
import {
  LAYER_LABELS,
  SERVICE_CATALOG,
  resolveServiceStatus,
  type PortalService,
  type ServiceStatus,
} from "../config/serviceCatalog";

function statusDotClasses(status: ServiceStatus): string {
  // Dot colors:
  // - enabled        → IADM orange
  // - not_subscribed → IADM dark blue
  // - coming_soon    → IADM light gray
  switch (status) {
    case "enabled":
      return "bg-[rgb(var(--iadm-orange))]";
    case "not_subscribed":
      return "bg-[rgb(var(--iadm-dark-blue))]";
    case "coming_soon":
    default:
      return "bg-[rgb(var(--iadm-light-gray))]";
  }
}

function navItemClass(isActive: boolean): string {
  // Branding & active underline handled in index.css via:
  // .iadm-nav-item and .iadm-nav-item-active
  return isActive ? "iadm-nav-item iadm-nav-item-active" : "iadm-nav-item";
}

export function SidebarNav() {
  const { features } = useEnabledServices();
  // SPARK pack 1: the Lead Gen search entries are shown when the SERVER says this
  // business may run a search (LEADGEN_TENANT_ALLOWLIST), not when the person
  // signed in happens to be the founder. Unresolved hides them — see
  // useLeadgenAccess on why this one gate fails closed.
  const leadgen = useLeadgenAccess();
  const catalog = leadgen.allowed ? SERVICE_CATALOG : SERVICE_CATALOG.filter((s) => !LEADGEN_LOCKED_KEYS.includes(s.key));

  // Shared "overview" item (top of nav)
  const overview = catalog.find((s) => s.key === "portal_overview");

  // Group services by section, excluding "Shared"
  const sections = catalog.filter((s) => s.section !== "Shared").reduce<
    Record<PortalService["section"], PortalService[]>
  >((acc, service) => {
    (acc[service.section] ??= []).push(service);
    return acc;
  }, {} as Record<PortalService["section"], PortalService[]>);

  const sectionOrder: PortalService["section"][] = [
    "ARION",
    "STELLA",
    "OLIVER",
    "LUMEN", // label shows as SPARK — Growth Platform via LAYER_LABELS
    "FORGE",
    "ARGUS",
  ];

  return (
    // All shell styling (background gradient, padding) comes from index.css
    <nav className="iadm-sidebar-inner flex h-full flex-col text-white">
      <ul className="space-y-4">
        {/* Top-level Overview item */}
        {overview && (
          <li>
            <NavLink to={overview.route} className={({ isActive }) => navItemClass(isActive)}>
              <div className="flex items-center gap-2">
                {/* Overview dot is always “enabled” */}
                <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--iadm-orange))]" />
                <span className="truncate">{overview.displayName}</span>
              </div>
            </NavLink>
          </li>
        )}

        {/* Product layers: ARION / STELLA / OLIVER / SPARK(LUMEN) / FORGE / ARGUS */}
        {sectionOrder.map((section) => {
          const services = sections[section];
          if (!services || services.length === 0) return null;

          return (
            <li key={section}>
              <div className="iadm-nav-title">{LAYER_LABELS[section]}</div>
              <ul className="space-y-0.5">
                {services.map((service) => {
                  const status = resolveServiceStatus(service, features);
                  return (
                    <li key={service.key}>
                      <NavLink
                        to={service.route}
                        className={({ isActive }) => navItemClass(isActive)}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${statusDotClasses(
                              status
                            )}`}
                          />
                          <span className="truncate">{service.displayName}</span>
                        </div>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}