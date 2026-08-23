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

export function StatTile({ label, value, hint, tone = 'default' }: {
  label: string; value: ReactNode; hint?: string; tone?: 'default' | 'warn';
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === 'warn' ? 'text-amber-800' : 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Button({ children, onClick, variant = 'secondary', type = 'button', disabled }: PropsWithChildren<{
  onClick?: () => void; variant?: 'primary' | 'secondary' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean;
}>) {
  const base = 'rounded-lg px-3 py-2 text-sm font-medium shadow-sm transition disabled:opacity-50';
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
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
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
