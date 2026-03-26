import type { PropsWithChildren, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';
import type { ArionSiteSummary } from '../../lib/arionApi';

export function ArionServiceLayout({
  service,
  status,
  sites,
  selectedSiteId,
  onSelectSite,
  actions,
  loading,
  error,
  children
}: PropsWithChildren<{
  service: PortalService;
  status: ServiceStatus;
  sites?: ArionSiteSummary[];
  selectedSiteId?: string | null;
  onSelectSite?: (siteId: string) => void;
  actions?: ReactNode;
  loading?: boolean;
  error?: string | null;
}>) {
  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">ARION</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{service.displayName}</h1>
            <p className="mt-1 text-sm text-slate-600">{service.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <StatusPill status={status} />
              {!!sites?.length && <span>{sites.length} linked site{sites.length === 1 ? '' : 's'}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:min-w-[320px]">
            {sites && sites.length > 0 && onSelectSite && (
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Active site
                <select
                  value={selectedSiteId || ''}
                  onChange={(e) => onSelectSite(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
                >
                  {sites.map((site) => (
                    <option key={site.siteId} value={site.siteId}>
                      {site.primaryDomain || site.wpUrl}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {actions}
          </div>
        </div>
      </section>

      {error && (
        <section className="iadm-card border-red-200">
          <div className="iadm-card-body text-sm text-red-600">{error}</div>
        </section>
      )}

      {loading ? (
        <section className="iadm-card">
          <div className="iadm-card-body text-sm text-slate-600">Loading ARION data…</div>
        </section>
      ) : (
        children
      )}
    </div>
  );
}

export function SiteActionLink({ href, children }: { href?: string | null; children: ReactNode }) {
  if (!href) {
    return (
      <button type="button" disabled className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400">
        {children}
      </button>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
      {children}
    </a>
  );
}

export function ArionTabBar({ tabs, activeTab, onChange }: { tabs: Array<{ key: string; label: string }>; activeTab: string; onChange: (value: string) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function ArionCard({ title, subtitle, children }: PropsWithChildren<{ title: string; subtitle?: string }>) {
  return (
    <section className="iadm-card">
      <div className="iadm-card-body">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </section>
  );
}

export function StatGrid({ items }: { items: Array<{ label: string; value: string | number; helper?: string }> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="iadm-card">
          <div className="iadm-card-body">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
            {item.helper && <div className="mt-1 text-xs text-slate-500">{item.helper}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyPanel({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <section className="iadm-card">
      <div className="iadm-card-body text-center">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mx-auto mt-2 max-w-3xl text-sm text-slate-600">{body}</p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </section>
  );
}

export function BackToOverviewLink() {
  return (
    <Link to="/app/services/arion_overview" className="text-sm font-medium text-sky-700 hover:text-sky-800">
      Back to ARION Overview
    </Link>
  );
}

function StatusPill({ status }: { status: ServiceStatus }) {
  const label = status === 'enabled' ? 'enabled' : status === 'not_subscribed' ? 'not subscribed' : 'coming soon';
  return <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">{label}</span>;
}
