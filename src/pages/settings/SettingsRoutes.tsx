/**
 * SettingsRoutes — per-route page wrappers for the hamburger-menu settings.
 *
 * Phase 1A of the OLIVER nav/settings split (2026-05-25):
 *   - Hamburger menu lists every tenant setting as a separate menu item.
 *   - Each menu item navigates to its own URL.
 *   - Pages share a common <SettingsLayout> chrome (title + back link to
 *     /app/settings hub).
 *
 * The legacy tabbed TenantSettings page still works at /app/settings — these
 * routes simply give each tab its own permanent URL. Tab content is reused
 * via the named exports (OrganizationTab, TeamTab, etc.) on TenantSettings.tsx
 * so there is exactly one implementation per setting.
 *
 * Settings that live in OLIVER feature pages (Team Access, Templates,
 * Booking, Territories, SLA) are NOT re-wrapped here — the AccountMenu links
 * point directly at their existing /app/services/oliver_* routes so we
 * don't duplicate the UI.
 */
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import {
  OrganizationTab,
  SubscriptionBillingTab,
  TeamTab,
  ConnectedAccountsTab,
  NotificationRulesTab,
  SecurityComplianceTab,
  DataPrivacyTab,
} from './TenantSettings';

function SettingsLayout({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <Link
          to="/app/settings"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All settings
        </Link>
      </div>
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </section>
      <section className="rounded-lg border bg-white p-5">{children}</section>
    </div>
  );
}

export function BusinessProfileSettingsPage() {
  return (
    <SettingsLayout
      title="Business Profile"
      description="Shared business info — used on invoices, quotes, portals, and emails across all products."
    >
      <OrganizationTab />
    </SettingsLayout>
  );
}

export function PlanPricingSettingsPage() {
  return (
    <SettingsLayout
      title="Plan & Pricing"
      description="Manage your subscriptions, see invoice history, and upgrade or downgrade plans."
    >
      <SubscriptionBillingTab />
    </SettingsLayout>
  );
}

export function TeamMembersSettingsPage() {
  return (
    <SettingsLayout
      title="Team Members"
      description="Manage who has access to your organization. (Per-product OLIVER roles live in OLIVER → Settings → Team Access.)"
    >
      <TeamTab />
    </SettingsLayout>
  );
}

export function IntegrationsSettingsPage() {
  return (
    <SettingsLayout
      title="Connected Accounts & Integrations"
      description="Connect Google, Bing, Apple Business Connect, Stripe, and lead-intake endpoints."
    >
      <ConnectedAccountsTab />
    </SettingsLayout>
  );
}

export function NotificationsSettingsPage() {
  return (
    <SettingsLayout
      title="Notification Rules"
      description="Which events trigger alerts and who gets them."
    >
      <NotificationRulesTab />
    </SettingsLayout>
  );
}

export function SecuritySettingsPage() {
  return (
    <SettingsLayout
      title="Security & Compliance"
      description="Password policy, session timeout, and audit log."
    >
      <SecurityComplianceTab />
    </SettingsLayout>
  );
}

export function DataPrivacySettingsPage() {
  return (
    <SettingsLayout
      title="Data & Privacy"
      description="Export your data and review retention policy."
    >
      <DataPrivacyTab />
    </SettingsLayout>
  );
}

/**
 * Hub page shown at /app/settings — replaces the tabbed UI as the default
 * landing. Each tile deep-links to a per-setting route. We still keep
 * TenantSettings.tsx (tabbed) reachable via /app/settings/all for users who
 * prefer the tabbed layout or have bookmarked it.
 */
const SETTINGS_TILES: Array<{
  group: string;
  items: Array<{ to: string; label: string; description: string; external?: boolean }>;
}> = [
  {
    group: 'Business',
    items: [
      { to: '/app/settings/business-profile', label: 'Business Profile', description: 'Name, address, phone, email, logo, brand colors' },
      { to: '/app/settings/brand-identity', label: 'Brand Identity', description: 'Logo, colors, typography, voice, tagline — applies everywhere' },
      { to: '/app/settings/plan-pricing', label: 'Plan & Pricing', description: 'Subscriptions, invoices, plan changes' },
      { to: '/app/settings/argus-data-plan', label: 'ARGUS AI Data Plan', description: 'AI credits — balance, packs, auto-topoff, and usage by action.' },
      { to: '/app/settings/team-members', label: 'Team Members', description: 'Invite users to your organization' },
      { to: '/app/settings/integrations', label: 'Connected Accounts & Integrations', description: 'Google, Bing, Stripe, lead intake' },
      { to: '/app/settings/sender-domain', label: 'Email Sender Domain', description: 'Send from your own domain — DNS records + verification' },
    ],
  },
  {
    group: 'OLIVER',
    items: [
      { to: '/app/services/oliver_team_access', label: 'Team Access (OLIVER)', description: 'Per-user OLIVER role + service access' },
      { to: '/app/services/oliver_templates', label: 'Templates (OLIVER)', description: 'Quote, invoice, and message templates' },
      { to: '/app/services/oliver_booking', label: 'Booking Page (OLIVER)', description: 'Public booking config + availability' },
      { to: '/app/services/oliver_territories', label: 'Territories (OLIVER, Pro)', description: 'Service area zones' },
      { to: '/app/services/oliver_sla_policies', label: 'SLA Policies (OLIVER, Pro)', description: 'Response-time SLAs' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { to: '/app/settings/notifications', label: 'Notification Rules', description: 'Email alerts for key events' },
      { to: '/app/settings/security', label: 'Security & Compliance', description: 'Password policy + session timeout' },
      { to: '/app/settings/data-privacy', label: 'Data & Privacy', description: 'Export + retention policy' },
    ],
  },
  {
    group: 'Help',
    items: [
      { to: '/app/settings/tours', label: 'Tours & Walkthroughs', description: 'Replay any of the 6 product tours — Guided or Walkthrough per product.' },
      { to: '/app/settings/walkthroughs', label: 'All Walkthroughs', description: 'Full library of every walkthrough across all products.' },
    ],
  },
];

export function SettingsHubPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-lg border bg-white p-5">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your business profile, integrations, billing, and per-product config. Open any tile to edit.
        </p>
      </section>

      {SETTINGS_TILES.map((g) => (
        <section key={g.group} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{g.group}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block rounded-lg border bg-white p-4 transition-colors hover:border-gray-400 hover:bg-gray-50"
              >
                <div className="text-sm font-semibold text-gray-900">{item.label}</div>
                <div className="mt-1 text-xs text-gray-500">{item.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}

      <p className="text-center text-xs text-gray-400">
        Prefer the old tabbed layout?{' '}
        <Link to="/app/settings/all" className="underline hover:text-gray-600">
          Open the full settings page
        </Link>
      </p>
    </div>
  );
}
