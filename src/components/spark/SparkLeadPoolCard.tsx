// SparkLeadPoolCard — "Lead pool this month", the SPARK Insights section
// produced by the monthly overnight re-score (L16).
//
// Reads GET /api/v1/leadgen/rescore/latest, which is the SAME payload the
// monthly email is rendered from, so the card and the client's inbox can never
// disagree. One fetch, per the portal data-fetching convention.
//
// TIER: the server has already stripped what this tenant may not see
// (`lead_intelligence: false` on Standard — counts and the cold-lead call to
// action, no points and no bands). This component reads that flag and renders
// the smaller card; it never decides entitlement for itself, and it never
// shows a row of dashes where numbers were removed.
//
// C7b: the cold-lead line offers the Lead Inbox, never an action of its own.
// Only the client's own bulk action moves a lead out of the inbox.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowUpRight, Snowflake } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";

interface Mover {
  lead_id: number;
  business_name: string;
  previous_score: number | null;
  score: number;
  delta: number;
  band: string | null;
  reason: string | null;
}

export interface LeadPoolReport {
  period: { month: string; label: string; from: string; to: string };
  run: { id: string | number; status: string; started_at: string | null; finished_at: string | null; triggered_by: string };
  totals: {
    in_inbox: number;
    changed: number | null;
    seen: number | null;
    hot: number | null; warm: number | null; cold: number | null;
    hot_before: number | null; warm_before: number | null; cold_before: number | null;
  };
  movers: { gains: Mover[]; drops: Mover[]; hidden?: boolean };
  cold: { count: number; days: number; action: { label: string; href: string; note?: string } };
  capacity: { unlimited: boolean; cap: number | null; used: number; pct: number; full: boolean } | null;
  lead_intelligence: boolean;
}

/** "9 (down 5)" — the shift spelled out so it reads without a legend. */
function Shift({ before, after }: { before: number | null; after: number | null }) {
  if (after == null) return <span className="text-slate-400">—</span>;
  const diff = before == null ? null : after - before;
  return (
    <span className="tabular-nums">
      {after}
      {diff != null && diff !== 0 && (
        <span className="ml-1 text-xs font-normal text-slate-500">
          ({diff > 0 ? `up ${diff}` : `down ${Math.abs(diff)}`})
        </span>
      )}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 text-xl font-bold text-slate-900">{children}</div>
    </div>
  );
}

function MoverRow({ m, direction }: { m: Mover; direction: "gain" | "drop" }) {
  const Icon = direction === "gain" ? ArrowUpRight : ArrowDownRight;
  return (
    <li className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-sm text-slate-900">{m.business_name}</div>
        {m.reason && <div className="truncate text-xs text-slate-500">{m.reason}</div>}
      </div>
      <div className={`flex flex-shrink-0 items-center gap-1 text-sm tabular-nums ${direction === "gain" ? "text-emerald-700" : "text-rose-700"}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="text-slate-500">{m.previous_score ?? "—"}</span>
        <span className="text-slate-400">→</span>
        <strong>{m.score}</strong>
      </div>
    </li>
  );
}

export function SparkLeadPoolCard({ className = "" }: { className?: string }) {
  const { get, ready } = useSparkApi();
  const [report, setReport] = useState<LeadPoolReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      const r = await get<{ data: LeadPoolReport | null }>("/api/v1/leadgen/rescore/latest");
      setReport(r?.data ?? null);
      setState("ready");
    } catch {
      // A card that cannot load must not take the Insights page down with it.
      setState("error");
    }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  if (state === "loading") {
    return <div className={`rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500 ${className}`}>Loading your lead pool…</div>;
  }
  if (state === "error") return null;

  // Never re-scored yet — say what will happen and when, rather than showing
  // an empty card that looks broken.
  if (!report) {
    return (
      <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
        <h2 className="text-base font-semibold text-slate-900">Lead pool this month</h2>
        <p className="mt-1 text-sm text-slate-600">
          We go through every lead in your inbox on the 1st of each month and bring the scores up to
          date. Your first summary will appear here after that run.
        </p>
        <Link to="/app/services/spark_leads" className="mt-3 inline-block text-sm font-medium text-slate-700 underline">
          Open the Lead Inbox →
        </Link>
      </div>
    );
  }

  const showIntel = report.lead_intelligence !== false;
  const t = report.totals;
  const rescoredOn = report.run.finished_at || report.run.started_at;

  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`} data-tour="insights-lead-pool">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Lead pool this month</h2>
        <span className="text-xs text-slate-500">
          {report.period.label}
          {rescoredOn && ` · re-scored ${new Date(rescoredOn).toLocaleDateString()}`}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {showIntel
          ? "Leads nobody has worked lose ground over time; leads you touch keep theirs. Nothing here moved out of your inbox — only you can do that."
          : "Where your Lead Inbox stands this month."}
      </p>

      <div className={`mt-3 grid gap-2 ${showIntel ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
        <Stat label="In your inbox">{t.in_inbox}</Stat>
        <Stat label={`Cold (${report.cold.days}+ days)`}>{report.cold.count}</Stat>
        {showIntel && <Stat label="Hot"><Shift before={t.hot_before} after={t.hot} /></Stat>}
        {showIntel && <Stat label="Warm"><Shift before={t.warm_before} after={t.warm} /></Stat>}
      </div>

      {report.capacity && !report.capacity.unlimited && report.capacity.cap != null && (
        <p className="mt-2.5 text-xs text-slate-500">
          Lead Inbox: <strong className="text-slate-700">{report.capacity.used} of {report.capacity.cap}</strong> ({report.capacity.pct}% full)
          {report.capacity.full && " — it is full; clear space to start a new search."}
        </p>
      )}
      {report.capacity?.unlimited && (
        <p className="mt-2.5 text-xs text-slate-500">Your Lead Inbox has no limit on your current package.</p>
      )}

      {report.cold.count > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <div className="flex items-start gap-2 text-sm text-amber-900">
            <Snowflake className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" aria-hidden="true" />
            <span>
              <strong>{report.cold.count} lead{report.cold.count === 1 ? " has" : "s have"} gone {report.cold.days} days without being worked.</strong>{" "}
              They stay in your inbox until you decide.
            </span>
          </div>
          <Link
            to={report.cold.action.href}
            className="flex-shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
          >
            {report.cold.action.label} →
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Nothing has gone cold — every lead in your inbox has been worked in the last {report.cold.days} days.
        </p>
      )}

      {showIntel && (report.movers.gains.length > 0 || report.movers.drops.length > 0) && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {report.movers.gains.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biggest gains</h3>
              <ul className="mt-1">{report.movers.gains.map((m) => <MoverRow key={m.lead_id} m={m} direction="gain" />)}</ul>
            </div>
          )}
          {report.movers.drops.length > 0 && (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Biggest drops</h3>
              <ul className="mt-1">{report.movers.drops.map((m) => <MoverRow key={m.lead_id} m={m} direction="drop" />)}</ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default SparkLeadPoolCard;
