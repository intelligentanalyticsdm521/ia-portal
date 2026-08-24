/**
 * forgeSoftware.ts — the registry of FORGE builds.
 *
 * FORGE is not a product like ARION or OLIVER. It is a product LINE that can
 * host an unbounded number of bespoke builds, one per client. Giving every
 * screen of every build its own `forge_<software>_<screen>` service key would
 * mean the catalogue grows by a dozen entries per client and the URL space
 * carries no hint of which software a page belongs to.
 *
 * So a build declares itself HERE, once, and everything else is derived:
 *   - URLs        /app/services/forge/<slug>/<screen>
 *   - navigation  one collapsible section per build, built from `screens`
 *   - entitlement one service key per build (`forge_<slug>`), never the
 *                 `forge` LINE key — that is what stops client A ever seeing
 *                 the software built for client B
 *
 * Adding a second build is one entry in SOFTWARE below. No new routes, no new
 * catalogue keys, no changes to the nav component.
 */
import type { EntityKey } from '../../lib/forgeApi';

/** A screen is either one of the bespoke pages, or a registry-driven entity list. */
export type ForgeScreenKind = 'overview' | 'reports' | 'receipts' | 'setup' | 'entity';

export interface ForgeScreen {
  /** URL segment under the software root. '' is the software's landing screen. */
  path: string;
  label: string;
  kind: ForgeScreenKind;
  /** Required when kind === 'entity'. */
  entity?: EntityKey;
  /** Hidden from the nav but still routable (detail pages, deep links). */
  hidden?: boolean;
}

export interface ForgeSoftware {
  slug: string;
  /** The per-software entitlement key. NEVER the `forge` line key. */
  serviceKey: string;
  name: string;
  tagline: string;
  description: string;
  screens: ForgeScreen[];
}

export const FORGE_SOFTWARE: ForgeSoftware[] = [
  {
    slug: 'hestia',
    serviceKey: 'forge_hestia',
    name: 'HESTIA',
    tagline: 'Non-Profit',
    description:
      'Case management and fundraising for non-profits — who you serve, what they receive, and where the money comes from.',
    screens: [
      { path: '', label: 'Overview', kind: 'overview' },

      // Programme — who the organisation serves and what it gives them.
      { path: 'clients', label: 'Clients', kind: 'entity', entity: 'clients' },
      { path: 'assistance', label: 'Assistance', kind: 'entity', entity: 'assistance' },
      { path: 'services', label: 'Services', kind: 'entity', entity: 'services' },
      { path: 'providers', label: 'Providers', kind: 'entity', entity: 'providers' },
      { path: 'volunteers', label: 'Volunteers', kind: 'entity', entity: 'volunteers' },

      // Fundraising — where the money comes from.
      { path: 'people', label: 'People', kind: 'entity', entity: 'people' },
      { path: 'donations', label: 'Donations', kind: 'entity', entity: 'donations' },
      { path: 'campaigns', label: 'Campaigns', kind: 'entity', entity: 'campaigns' },
      { path: 'funds', label: 'Funds', kind: 'entity', entity: 'funds' },
      { path: 'pledges', label: 'Pledges', kind: 'entity', entity: 'pledges' },
      { path: 'recurring', label: 'Recurring Gifts', kind: 'entity', entity: 'recurring' },
      { path: 'funders', label: 'Funders', kind: 'entity', entity: 'funders' },
      { path: 'applications', label: 'Funding Applications', kind: 'entity', entity: 'applications' },

      // Obligations and reporting.
      { path: 'acknowledgements', label: 'Acknowledgements', kind: 'receipts' },
      { path: 'reports', label: 'Reports', kind: 'reports' },
      { path: 'setup', label: 'Organization Setup', kind: 'setup' },
    ],
  },
];

export const softwareBySlug = (slug: string): ForgeSoftware | null =>
  FORGE_SOFTWARE.find((s) => s.slug === slug) ?? null;

/** Root URL for a build. */
export const softwareRoot = (slug: string) => `/app/services/forge/${slug}`;

/** URL for one screen of a build. */
export const screenRoute = (slug: string, screenPath: string) =>
  screenPath ? `${softwareRoot(slug)}/${screenPath}` : softwareRoot(slug);

/**
 * The builds this tenant actually owns.
 *
 * Reads the per-software key so a tenant on the FORGE line who owns no build
 * gets an empty list — and therefore the "need custom software?" landing page
 * rather than a list of other clients' software.
 */
export const ownedSoftware = (ownedProducts: Set<string>): ForgeSoftware[] =>
  FORGE_SOFTWARE.filter((s) => ownedProducts.has(s.serviceKey));

/**
 * Legacy flat routes (`/app/services/forge_clients`) redirect here. They were
 * live for about a day, but a bookmark that 404s is a support ticket, and the
 * mapping costs one object.
 */
export const LEGACY_FORGE_ROUTES: Record<string, string> = {
  forge_overview: screenRoute('hestia', ''),
  forge_clients: screenRoute('hestia', 'clients'),
  forge_assistance: screenRoute('hestia', 'assistance'),
  forge_services: screenRoute('hestia', 'services'),
  forge_providers: screenRoute('hestia', 'providers'),
  forge_funders: screenRoute('hestia', 'funders'),
  forge_applications: screenRoute('hestia', 'applications'),
  forge_volunteers: screenRoute('hestia', 'volunteers'),
  forge_people: screenRoute('hestia', 'people'),
  forge_donations: screenRoute('hestia', 'donations'),
  forge_campaigns: screenRoute('hestia', 'campaigns'),
  forge_funds: screenRoute('hestia', 'funds'),
  forge_pledges: screenRoute('hestia', 'pledges'),
  forge_recurring: screenRoute('hestia', 'recurring'),
  forge_receipts: screenRoute('hestia', 'acknowledgements'),
  forge_reports: screenRoute('hestia', 'reports'),
  forge_setup: screenRoute('hestia', 'setup'),
};
