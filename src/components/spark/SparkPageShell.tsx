import { useEffect, useState, type ReactNode } from "react";
import { isTierGateError, type TierGateError } from "../../hooks/useOliverApi";
import { OliverUpgradeGate } from "../OliverUpgradeGate";
import { SparkTooltip } from "./SparkTooltip";
import { UsageChip } from "./UsageChip";
// P5 — "you have new leads": the banner on the first SPARK page after a
// scheduled run, and the toast when a run finishes while you are in the app.
// Mounted once here so no page opts in (and the Lead Inbox page is untouched).
import { NewLeadsBanner, NewLeadsToast } from "./NewLeadsBanner";

interface SparkPageShellProps {
  title: string;
  subtitle?: string;
  /** Plain-English explanation of what this page is and when to use it.
   *  Renders as a (?) icon next to the subtitle that shows a tooltip on hover. */
  help?: ReactNode;
  /** Top-LEFT slot in the sticky header, before the title.
   *  Back buttons live here (standing convention 2026-09-15, Brandon): the way
   *  back is always the first thing in the header, never mixed into the
   *  right-hand action group with Edit / Delete. */
  leading?: ReactNode;
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
  title, subtitle, help, leading, actions, stats, filters, children, error, loading,
}: SparkPageShellProps) {
  if (isTierGateError(error)) {
    return (
      <div className="spark-page">
        <SparkPageHeader title={title} subtitle={subtitle} leading={leading} />
        <div className="spark-page-body">
          <OliverUpgradeGate
            needs={(error as TierGateError).needs}
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
      <NewLeadsBanner />
      <NewLeadsToast />
      <SparkPageHeader title={title} subtitle={subtitle} help={help} leading={leading} actions={actions} />
      {stats && <div className="spark-stat-strip-wrap">{stats}</div>}
      {filters && <div className="spark-filter-row">{filters}</div>}
      <div className="spark-page-body">
        {loading && <LoadingWithTimeout />}
        {error && !loading ? (
          <div className="spark-error">
            <div className="font-medium">Something went wrong loading this page.</div>
            <div className="text-xs mt-1 text-rose-700">
              {error instanceof Error ? error.message : String(error)}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="spark-btn spark-btn-secondary spark-btn-sm mt-3"
            >
              Reload page
            </button>
          </div>
        ) : null}
        {!loading && !error ? children : null}
      </div>
    </div>
  );
}

/**
 * Loading indicator that flips to a "still loading?" message after 8s.
 * Prevents the "stuck on loading" UX where users see a spinner forever
 * with no way to recover.
 */
function LoadingWithTimeout() {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStalled(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="spark-loading">
      {stalled ? (
        <div>
          <div>Still loading…</div>
          <div className="text-[11px] text-slate-400 mt-1">If this hangs, try reloading the page.</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="spark-btn spark-btn-secondary spark-btn-sm mt-3"
          >
            Reload
          </button>
        </div>
      ) : (
        <span>Loading…</span>
      )}
    </div>
  );
}

interface SparkPageHeaderProps {
  title: string;
  subtitle?: string;
  help?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}
function SparkPageHeader({ title, subtitle, help, leading, actions }: SparkPageHeaderProps) {
  return (
    <div className="spark-page-header">
      {/* Top-left slot — the way back, before the title. */}
      {leading && <div className="flex items-center gap-2 flex-shrink-0">{leading}</div>}
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-slate-900 truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
            <span className="truncate">{subtitle}</span>
            {help && <SparkTooltip content={help} maxWidth={320} side="bottom" />}
          </p>
        )}
      </div>
      {/* Usage chip — auto-injected on EVERY Spark*Page via the shell. No
          per-page opt-in. Replaces the deleted "Tier usage" dashboard
          card. Links to /app/services/spark_usage for full per-metric
          detail. Hidden silently when usage fetch fails so the header
          can't break the page. */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <UsageChip />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
