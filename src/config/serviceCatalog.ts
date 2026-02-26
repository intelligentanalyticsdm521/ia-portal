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
  Shared: 'Overview',
  ARION: 'ARION — Web & Digital Presence',
  STELLA: 'STELLA — Reporting & BI',
  OLIVER: 'OLIVER — Operations & Portals',
  LUMEN: 'SPARK — Growth Platform',
  FORGE: 'FORGE — Software & Integrations',
  ARGUS: 'ARGUS — Orchestration & Automation'
};

export const SERVICE_CATALOG: PortalService[] = [
  // Shared
  {
    key: 'portal_overview',
    displayName: 'Overview',
    section: 'Shared',
    defaultStatus: 'enabled',
    route: '/app/overview',
    description: 'High-level account overview and shortcuts into each Intelligence Layer.'
  },

  // ARION
  {
    key: 'arion_websites',
    displayName: 'Websites',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_websites',
    description: 'Website and landing page status (read-only preview surface).'
  },
  {
    key: 'arion_hosting',
    displayName: 'Hosting',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_hosting',
    description: 'Hosting status, environments, and uptime (placeholder).'
  },
  {
    key: 'arion_domains',
    displayName: 'Domains & SSL',
    section: 'ARION',
    defaultStatus: 'coming_soon',
    route: '/app/services/arion_domains',
    description: 'Domain connection and SSL status (placeholder).'
  },

  // STELLA
  {
    key: 'stella_dashboards',
    displayName: 'Dashboards',
    section: 'STELLA',
    defaultStatus: 'coming_soon',
    route: '/app/services/stella_dashboards',
    description: 'KPI dashboards and operational performance panels (placeholder).'
  },

  // OLIVER
  {
    key: 'oliver_operations',
    displayName: 'Operations',
    section: 'OLIVER',
    defaultStatus: 'coming_soon',
    route: '/app/services/oliver_operations',
    description: 'Job lifecycle views and basic pipeline surfaces (placeholder).'
  },
  {
    key: 'oliver_portals',
    displayName: 'Portals',
    section: 'OLIVER',
    defaultStatus: 'coming_soon',
    route: '/app/services/oliver_portals',
    description: 'Customer and employee portals (placeholder).'
  },

  // LUMEN / SPARK — Growth Platform
  {
    key: 'lumen_overview',
    displayName: 'Overview — Standard',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_overview',
    description:
      'High-level SPARK growth summary: email & SMS usage, active audiences, and recent performance.'
  },
  {
    key: 'lumen_contacts',
    displayName: 'CRM — Standard',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_contacts',
    description: 'Read-only CRM view into SPARK contacts, segments, and basic engagement.'
  },
  {
    key: 'lumen_campaigns',
    displayName: 'Campaigns & Messaging',
    section: 'LUMEN',
    defaultStatus: 'not_subscribed',
    route: '/app/services/lumen_campaigns',
    description: 'Recent and upcoming SPARK email & SMS campaigns.'
  },
  {
    key: 'lumen_leads',
    displayName: 'Leads — Preview',
    section: 'LUMEN',
    defaultStatus: 'coming_soon',
    route: '/app/services/lumen_leads',
    description:
      'Future lead capture and routing surfaces for SPARK + OLIVER. Placeholder only in v1.'
  },

  // FORGE
  {
    key: 'forge_integrations',
    displayName: 'Integrations',
    section: 'FORGE',
    defaultStatus: 'coming_soon',
    route: '/app/services/forge_integrations',
    description: 'Integration health and sync status (placeholder).'
  },

  // ARGUS
  {
    key: 'argus_automation',
    displayName: 'Automation',
    section: 'ARGUS',
    defaultStatus: 'coming_soon',
    route: '/app/services/argus_automation',
    description: 'Automation orchestration and Intelligence Layer wiring (placeholder).'
  }
];

export function resolveServiceStatus(service: PortalService, enabledKeys: Set<string>): ServiceStatus {
  if (service.defaultStatus === 'enabled') return 'enabled';
  if (enabledKeys.has(service.key)) return 'enabled';
  return service.defaultStatus;
}