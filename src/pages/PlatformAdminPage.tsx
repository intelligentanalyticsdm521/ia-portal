/**
 * PlatformAdminPage — SUPER_ADMIN only.
 *
 * Routed at /admin. Reached via the gear icon at the bottom of the IconRail
 * (which is hidden for non-SUPER_ADMIN users). For now a stub landing — will
 * grow into cross-tenant ops, dead-tenant cleanup, migration runners, etc.
 *
 * Tenant settings are NOT here — those live under the hamburger menu at
 * /app/settings/*.
 */
import { Link } from 'react-router-dom';
import { Shield, Database, Users as UsersIcon, Settings as SettingsIcon, Target, TrendingUp, AlertTriangle, Inbox, Hammer, Brain } from 'lucide-react';

export function PlatformAdminPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <section className="rounded-lg border bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Platform Admin</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Cross-tenant operations restricted to platform administrators.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Looking for your business settings, billing, or integrations? Those live in the{' '}
        <Link to="/app/settings" className="font-semibold underline">
          hamburger menu (top-right) → Settings
        </Link>
        . This page is reserved for platform-level operations.
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/app/admin/leadgen"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Target className="h-4 w-4 text-[#EF6C33]" />
            SPARK Lead Gen Admin
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Term + industry review queues, source ablation, global blocklist, Hunter balance.
          </div>
        </Link>
        <Link
          to="/app/admin/error-log"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <AlertTriangle className="h-4 w-4 text-[#EF6C33]" />
            Client-Facing Error Log
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Every 4xx/5xx across all four APIs — when a client says "it broke", the attempt is here.
          </div>
        </Link>
        <Link
          to="/app/admin/site-requests"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Inbox className="h-4 w-4 text-[#EF6C33]" />
            Website Change Requests
          </div>
          <div className="mt-1 text-xs text-gray-500">
            What clients have asked us to change on their websites — move one to Done and they get told.
          </div>
        </Link>
        <a
          href="https://claude.ai/code/artifact/9b14ebf7-1de1-45b9-859b-6f16bbcec805"
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Hammer className="h-4 w-4 text-[#EF6C33]" />
            FORGE
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Decide, approve scopes, tick to-dos, walk features and watch the build queue. Opens the FORGE console (your Claude login).
          </div>
        </a>
        <Link
          to="/app/admin/il-learning"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Brain className="h-4 w-4 text-[#EF6C33]" />
            Intelligence Layer
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Can we trust the model yet, and what is checking it costing? Agreement per model and per business.
          </div>
        </Link>
        <Link
          to="/app/admin/argus-margin"
          className="rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-[#EF6C33] hover:bg-amber-50/40"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <TrendingUp className="h-4 w-4 text-[#EF6C33]" />
            ARGUS Margin Dashboard
          </div>
          <div className="mt-1 text-xs text-gray-500">
            Per-action cost basis vs credits sold; quarterly pricing edit surface.
          </div>
        </Link>
        <PlaceholderTile
          icon={<UsersIcon className="h-4 w-4" />}
          title="Tenants"
          description="Browse, switch into, or suspend tenants"
        />
        <PlaceholderTile
          icon={<Database className="h-4 w-4" />}
          title="Schema & Migrations"
          description="Run pending migrations + view migration log"
        />
        <PlaceholderTile
          icon={<SettingsIcon className="h-4 w-4" />}
          title="Feature Flags"
          description="Per-tenant feature flag overrides"
        />
      </div>
    </div>
  );
}

function PlaceholderTile({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-white p-4 opacity-60">
      <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span className="text-gray-400">{icon}</span>
        {title}
      </div>
      <div className="mt-1 text-xs text-gray-500">{description}</div>
      <div className="mt-3 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">
        Coming soon
      </div>
    </div>
  );
}
