export type ServiceStatus = 'enabled' | 'not_subscribed' | 'coming_soon';

export interface PortalService {
  key: string;
  displayName: string;
  section: 'Shared' | 'ARION' | 'STELLA' | 'OLIVER' | 'LUMEN' | 'FORGE' | 'ARGUS';
  defaultStatus: ServiceStatus;
  route: string;
  description: string;
}

/**
 * Display labels for left-nav parent sections.
 * This is UI-only. It does not change authentication, tenant verification, or backend contracts.
 */
export const LAYER_LABELS: Record<PortalService['section'], string> = {
  Shared: 'Shared',
  ARION: 'ARION — Web & Digital Presence',
  STELLA: 'STELLA — Reporting & BI',
  OLIVER: 'OLIVER — Operations & Portals',
  LUMEN: 'LUMEN — CRM (Email)',
  FORGE: 'FORGE — Software & Integrations',
  ARGUS: 'ARGUS — Orchestration & Automation'
};

/**
 * Portal v1 catalogs all services for navigation.
 *
 * IMPORTANT: platform-api v1 does not expose a "tenant services" endpoint.
 * To avoid inventing new backend behavior, v1 determines "enabled" services
 * using VITE_ENABLED_SERVICES (comma-separated service keys). Everything else
 * falls back to defaultStatus.
 */
export const SERVICE_CATALOG: PortalService[] = [
  {
    key: 'portal_overview',
    displayName: 'Overview',
    section: 'Shared',
    defaultStatus: 'enabled',
    route: '/app/overview',
    description: 'High-level overview and quick links.'
  },

  // ARION
  {
    key: 'arion_websites',
    displayName: 'Websites',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_websites',
    description: 'Website provisioning and managed web presence.'
  },
  {
    key: 'arion_hosting',
    displayName: 'Hosting',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_hosting',
    description: 'Hosting status visibility and managed workflows.'
  },
  {
    key: 'arion_domains_ssl',
    displayName: 'Domains & SSL',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_domains_ssl',
    description: 'Domain connection state and SSL health visibility.'
  },

  // STELLA
  {
    key: 'stella_dashboards',
    displayName: 'Dashboards',
    section: 'STELLA',
    defaultStatus: 'coming_soon',
    route: '/app/services/stella_dashboards',
    description: 'KPI dashboards and operational performance panels.'
  },
  {
    key: 'stella_reports',
    displayName: 'Reports',
    section: 'STELLA',
    defaultStatus: 'coming_soon',
    route: '/app/services/stella_reports',
    description: 'Saved reports and exports (placeholder).'
  },

  // OLIVER
  {
    key: 'oliver_customer_portal',
    displayName: 'Customer Portal',
    section: 'OLIVER',
    defaultStatus: 'coming_soon',
    route: '/app/services/oliver_customer_portal',
    description: 'Customer-facing portal experience (placeholder).'
  },
  {
    key: 'oliver_employee_portal',
    displayName: 'Employee Portal',
    section: 'OLIVER',
    defaultStatus: 'coming_soon',
    route: '/app/services/oliver_employee_portal',
    description: 'Employee/contractor portal experience (placeholder).'
  },
  {
    key: 'oliver_job_lifecycle',
    displayName: 'Job Lifecycle',
    section: 'OLIVER',
    defaultStatus: 'coming_soon',
    route: '/app/services/oliver_job_lifecycle',
    description: 'Job states and workflow surfaces (placeholder).'
  },

  // LUMEN
  {
    key: 'lumen_contacts',
    displayName: 'Contacts',
    section: 'LUMEN',
    defaultStatus: 'coming_soon',
    route: '/app/services/lumen_contacts',
    description: 'Contacts, consent, and segments (placeholder).'
  },
  {
    key: 'lumen_campaigns',
    displayName: 'Campaigns',
    section: 'LUMEN',
    defaultStatus: 'coming_soon',
    route: '/app/services/lumen_campaigns',
    description: 'Campaign creation and sending (placeholder).'
  },
  {
    key: 'lumen_deliverability',
    displayName: 'Deliverability',
    section: 'LUMEN',
    defaultStatus: 'coming_soon',
    route: '/app/services/lumen_deliverability',
    description: 'Delivery, bounces, and unsubscribes (placeholder).'
  },

  // FORGE
  {
    key: 'forge_integrations',
    displayName: 'Integrations',
    section: 'FORGE',
    defaultStatus: 'coming_soon',
    route: '/app/services/forge_integrations',
    description: 'Connected systems and integration health (placeholder).'
  },
  {
    key: 'forge_builds',
    displayName: 'Builds',
    section: 'FORGE',
    defaultStatus: 'coming_soon',
    route: '/app/services/forge_builds',
    description: 'Custom builds and implementation tracking (placeholder).'
  },

  // ARGUS
  {
    key: 'argus_automations',
    displayName: 'Automations',
    section: 'ARGUS',
    defaultStatus: 'coming_soon',
    route: '/app/services/argus_automations',
    description: 'Automation orchestration (placeholder).'
  },
  {
    key: 'argus_intelligence_layers',
    displayName: 'Intelligence Layers',
    section: 'ARGUS',
    defaultStatus: 'coming_soon',
    route: '/app/services/argus_intelligence_layers',
    description: 'IADM-IL configuration surfaces (placeholder).'
  }
];

export function resolveServiceStatus(service: PortalService, enabledKeys: Set<string>): ServiceStatus {
  if (service.defaultStatus === 'enabled') return 'enabled';
  if (enabledKeys.has(service.key)) return 'enabled';
  return service.defaultStatus;
}
