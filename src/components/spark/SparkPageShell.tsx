import { type ReactNode } from "react";
import { isTierGateError, type TierGateError } from "../../hooks/useOliverApi";
import { OliverUpgradeGate } from "../OliverUpgradeGate";

interface SparkPageShellProps {
  title: string;
  subtitle?: string;
  /** Right-side actions in the sticky header (e.g. primary "+ New" button) */
  actions?: ReactNode;
  /** Optional inline horizontal stat strip directly under the header */
  stats?: ReactNode;
  /** Optional pill filter row above the page body */
  filters?: ReactNode;
  /** Page body — usually a table or grid */
  children: ReactNode;
  error?: unknown;
  loading?: boolean;
}

/**
 * SparkPageShell — Brevo/HubSpot-style page chrome for interactive SPARK pages.
 *
 * Differences from OliverPageWrapper:
 * - Sticky page header bar at top (title + count + actions stay visible on scroll)
 * - Inline stat strip (not a 4-card grid)
 * - Pill filter row directly above content
 * - No wrapping card around the page body — table/grid sits directly on a light
 *   background so the data feels primary
 * - Tighter vertical rhythm (12px between sections, not 24px)
 *
 * Use this instead of OliverPageWrapper on all interactive SPARK pages.
 */
export function SparkPageShell({
  title, subtitle, actions, stats, filters, children, error, loading,
}: SparkPageShellProps) {
  if (isTierGateError(error)) {
    return (
      <div className="spark-page">
        <SparkPageHeader title={title} subtitle={subtitle} />
        <div className="spark-page-body">
          <OliverUpgradeGate
            tierRequired={(error as TierGateError).tierRequired}
            currentTier={(error as TierGateError).currentTier}
            featureName={title}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="spark-page">
      <SparkPageHeader title={title} subtitle={subtitle} actions={actions} />
      {stats && <div className="spark-stat-strip-wrap">{stats}</div>}
      {filters && <div className="spark-filter-row">{filters}</div>}
      <div className="spark-page-body">
        {loading && <div className="spark-loading">Loading…</div>}
        {error && !loading ? (
          <div className="spark-error">
            <div className="font-medium">Something went wrong loading this page.</div>
            <div className="text-xs mt-1 text-rose-700">
              {error instanceof Error ? error.message : String(error)}
            </div>
          </div>
        ) : null}
        {!loading && !error ? children : null}
      </div>
    </div>
  );
}

interface SparkPageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}
function SparkPageHeader({ title, subtitle, actions }: SparkPageHeaderProps) {
  return (
    <div className="spark-page-header">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
