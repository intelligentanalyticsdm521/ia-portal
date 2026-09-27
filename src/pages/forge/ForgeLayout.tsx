import { Link } from 'react-router-dom';
import type { PropsWithChildren, ReactNode } from 'react';
import type { PortalService, ServiceStatus } from '../../config/serviceCatalog';

export function ForgeLayout({
  title, subtitle, actions, error, loading, loadingLabel = 'Loading…', children,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  error?: string | null;
  loading?: boolean;
  loadingLabel?: string;
}>) {
  return (
    <div className="space-y-6">
      <section className="iadm-card">
        <div className="iadm-card-body flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">FORGE</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      </section>

      {error && (
        <section className="iadm-card border-red-200">
          <div className="iadm-card-body text-sm text-red-600">{error}</div>
        </section>
      )}

      {loading ? (
        <section className="iadm-card">
          <div className="iadm-card-body text-sm text-slate-600">{loadingLabel}</div>
        </section>
      ) : children}
    </div>
  );
}

export function Card({ title, action, children }: PropsWithChildren<{ title?: string; action?: ReactNode }>) {
  return (
    <section className="iadm-card">
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
          {action}
        </div>
      )}
      <div className="iadm-card-body">{children}</div>
    </section>
  );
}

/**
 * A number on a dashboard is a question the reader wants to follow. Passing
 * `to` turns the tile into a link to the records behind it — "8 Clients" goes
 * to Clients, "3 Needs review" goes to the filtered list of exactly those
 * three. Without it the reader has to work out which nav item corresponds to
 * the number they just read.
 */
export function StatTile({ label, value, hint, tone = 'default', to }: {
  label: string; value: ReactNode; hint?: string; tone?: 'default' | 'warn'; to?: string;
}) {
  const base = `block rounded-xl border px-4 py-3 ${
    tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
  }`;
  const body = (
    <>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-amber-800' : 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </>
  );

  if (!to) return <div className={base}>{body}</div>;
  return (
    <Link
      to={to}
      className={`${base} group transition hover:border-slate-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-400`}
    >
      {body}
      <div className="mt-2 text-xs font-medium text-slate-400 group-hover:text-slate-600">View →</div>
    </Link>
  );
}

export function Button({ children, onClick, variant = 'secondary', size = 'md', type = 'button', disabled }: PropsWithChildren<{
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  /**
   * `sm` exists for the row-action block in a list. That block is the LAST
   * column of the table, so it is the first thing pushed past the right edge
   * when the columns get wide — three default buttons cost 224px of a scroll
   * box that is 731px at 1280. At `sm` the same three cost about 90px less.
   */
  size?: 'sm' | 'md';
  type?: 'button' | 'submit';
  disabled?: boolean;
}>) {
  /* inline-flex, so a button can carry an icon beside its label and have the two
     sit on one baseline — the header row (Export, Import, Bulk add, New X) reads
     as a row of controls rather than four different shapes. */
  const base = `inline-flex items-center gap-1.5 rounded-lg font-medium shadow-sm transition disabled:opacity-50 ${
    size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm'
  }`;
  const styles = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    danger: 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
  }[variant];
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  );
}

export function Pill({ children, tone = 'slate' }: PropsWithChildren<{ tone?: 'slate' | 'green' | 'amber' | 'red' }>) {
  const styles = {
    slate: 'bg-slate-100 text-slate-700',
    green: 'bg-emerald-100 text-emerald-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
  }[tone];
  /* shrink-0 + nowrap: in a list cell the pill sits beside a name in a flex row
     with a max width, and without these it was the pill that gave way — "Needs
     review" wrapped to two lines and took that row from 43px to 53px, which is
     exactly the ragged-rows, staggered-buttons effect this pass exists to
     remove. The NAME is the thing that should truncate. */
  return <span className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}

export function statusTone(status?: string | null): 'slate' | 'green' | 'amber' | 'red' {
  const s = String(status ?? '').toLowerCase();
  if (s === 'active' || s === 'approved') return 'green';
  if (s.startsWith('pending') || s === 'hold') return 'amber';
  if (s === 'cancelled' || s === 'declined' || s === 'never approved') return 'red';
  return 'slate';
}

export function EmptyState({ children }: PropsWithChildren) {
  return <div className="py-8 text-center text-sm text-slate-500">{children}</div>;
}

/** Kept so ServiceRouter can pass the catalog entry through unchanged. */
export type ForgePageProps = { service: PortalService; status: ServiceStatus };
