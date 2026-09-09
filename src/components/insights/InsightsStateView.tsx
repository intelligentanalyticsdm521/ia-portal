/**
 * The three honest answers an insights page can give when it has no numbers, and
 * the label it wears when the numbers are made up.
 *
 * These replace `payload || demoSparkMetrics(activeTenantId)` on the SPARK insight
 * pages. That expression drew a full year of dashboards, gauges and forecasts from
 * a seed derived from the business's own id whenever the real fetch failed or came
 * back empty — plausible, stable, unlabelled, and not theirs.
 *
 * EMPTY SAYS WHAT FILLS IT. "No data" is a dead end; a client reads it as "this
 * product does not work". Each page passes the two or three things that actually
 * produce its numbers, with links, so the answer to "why is this blank" is on the
 * blank page.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BarChart3, FlaskConical } from 'lucide-react';

/** Where the numbers come from, in the owner's words. */
export type InsightsSource = { label: string; to: string; why: string };

export function InsightsLoading() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8">
      <div className="mx-auto h-4 w-40 animate-pulse rounded bg-slate-200" />
      <div className="mx-auto mt-3 h-3 w-64 animate-pulse rounded bg-slate-100" />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-slate-100" />)}
      </div>
    </div>
  );
}

/**
 * We could not read the numbers. This is NOT the empty state: telling somebody
 * "you have no data" when the truth is "we could not reach the server" sends them
 * looking for a problem in their own account.
 */
export function InsightsError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-700" />
        <div>
          <div className="text-sm font-semibold text-amber-900">We couldn&apos;t load your numbers</div>
          <p className="mt-1 max-w-xl text-sm text-amber-800">
            This is a problem on our side, not with your account, and nothing here is
            missing or lost. Try again in a moment.
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Nothing to measure yet — and what will change that. */
export function InsightsEmpty({
  title, lead, sources,
}: { title: string; lead: string; sources: InsightsSource[] }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8">
      <div className="mx-auto max-w-2xl text-center">
        <BarChart3 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <div className="text-sm font-semibold text-slate-800">{title}</div>
        <p className="mt-1 text-sm text-slate-600">{lead}</p>
      </div>
      <ul className="mx-auto mt-5 max-w-2xl space-y-2">
        {sources.map((s) => (
          <li key={s.to + s.label} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <Link to={s.to} className="whitespace-nowrap text-xs font-semibold text-[#EF6C33] hover:underline">
              {s.label}
            </Link>
            <span className="text-xs text-slate-600">{s.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The label that makes sample data honest. Rendered wherever the dev-only demo
 * generator is feeding a page (see insightsDemo.ts) — never hidden, never subtle.
 */
export function SampleDataBadge({ children }: { children?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border-2 border-dashed border-violet-400 bg-violet-50 px-4 py-3">
      <FlaskConical className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-700" />
      <div className="text-sm text-violet-900">
        <span className="font-bold uppercase tracking-wide">Sample data</span>
        <span className="ml-2">
          {children || 'Every number below is made up, for looking at the layout. It is not this business’s data.'}
        </span>
      </div>
    </div>
  );
}
