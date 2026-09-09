// AgentRunHistoryPanel — "What it has been doing".
//
// The run side of an agent, which had no surface at all. Before this, a failed
// run, a sticky halt, a provider outage, an escalation and a perfectly ordinary
// "there was nothing due" were all invisible from the Portal — so an agent
// working correctly and an agent broken since Tuesday looked identical, which is
// the single most likely way a live POC reads as "the agents did nothing".
//
// Collapsed by default. This is the panel you open when you want to know WHY,
// not the one you read every day; putting it open would bury the drafts that
// actually need a decision.
//
// AG-1: there is no dollar figure anywhere in here. The server does not send one
// to a client endpoint, so there is nothing to render even by accident. `cost_note`
// is the sentence a client reads.
import { useState } from "react";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock,
  MinusCircle, PauseCircle, ShieldAlert, XCircle,
} from "lucide-react";
import type { AgentRunRow, AgentRunsPayload } from "./types";

interface Props {
  runs: AgentRunsPayload | null;
  loading?: boolean;
  /** Shown when there is no history at all. */
  emptyBody?: string;
  /** Start open. Off by default — see the header. */
  defaultOpen?: boolean;
}

function when(ts: string | null | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

const OUTCOME_ICON: Record<string, typeof CheckCircle2> = {
  worked: CheckCircle2,
  nothing_due: MinusCircle,
  skipped: MinusCircle,
  blocked: AlertTriangle,
  escalated: ShieldAlert,
  halted: PauseCircle,
  failed: XCircle,
  running: Clock,
};

const OUTCOME_TONE: Record<string, string> = {
  worked: "text-emerald-600",
  nothing_due: "text-slate-400",
  skipped: "text-slate-400",
  blocked: "text-amber-600",
  escalated: "text-violet-600",
  halted: "text-amber-500",
  failed: "text-rose-600",
  running: "text-sky-600",
};

function RunRow({ row }: { row: AgentRunRow }) {
  const Icon = OUTCOME_ICON[row.outcome] || MinusCircle;
  const tone = OUTCOME_TONE[row.outcome] || "text-slate-400";
  return (
    <li className="flex items-start gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
      <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-slate-800">{row.outcome_label}</div>
        <div className="text-[11px] text-slate-500">
          {row.agent_label} · {row.trigger_label}
          {row.started_at ? ` · ${when(row.started_at)}` : ""}
        </div>
        {row.keywords && row.keywords.length > 0 && (
          <div className="mt-0.5 text-[11px] text-slate-600">
            About: {row.keywords.slice(0, 4).join(", ")}
          </div>
        )}
        {/* Why it skipped what it skipped. This is the part that makes a
            "nothing to do" run trustworthy instead of suspicious. */}
        {row.notes.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {row.notes.map((n, i) => (
              <li key={i} className="text-[11px] text-slate-600">· {n}</li>
            ))}
          </ul>
        )}
        {row.failure && (
          <div className="mt-1 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-900">
            {row.failure.reason}
          </div>
        )}
      </div>
    </li>
  );
}

export function AgentRunHistoryPanel({ runs, loading, emptyBody, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const Chevron = open ? ChevronDown : ChevronRight;

  const meta = runs?.meta;
  const summary = !meta
    ? null
    : meta.total === 0
      ? "It has not run yet."
      : [
        `${meta.total} ${meta.total === 1 ? "run" : "runs"}`,
        meta.failed > 0 ? `${meta.failed} could not finish` : null,
        meta.held > 0 ? `${meta.held} held something back` : null,
        meta.halted > 0 ? `${meta.halted} stopped on a spending limit` : null,
        meta.last_run_at ? `last ${when(meta.last_run_at)}` : null,
      ].filter(Boolean).join(" · ");

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Chevron className="h-4 w-4 flex-shrink-0 text-slate-400" />
        <span className="text-xs font-semibold text-slate-900">What it has been doing</span>
        {summary && <span className="truncate text-[11px] text-slate-500">{summary}</span>}
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {loading && !runs && <div className="px-3 py-3 text-xs text-slate-500">Loading…</div>}

          {runs && runs.meta.degraded.length > 0 && (
            <div className="m-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
              <div className="font-semibold">Some of this history could not be loaded</div>
              <ul className="mt-0.5 space-y-0.5">
                {runs.meta.degraded.map((d) => <li key={d.agent}>{d.agent}: {d.error}</li>)}
              </ul>
            </div>
          )}

          {runs && runs.rows.length === 0 && (
            <div className="px-3 py-3 text-xs text-slate-600">
              {emptyBody || "No runs yet. It writes its first entry here the moment it runs."}
            </div>
          )}

          {runs && runs.rows.length > 0 && (
            <ul>{runs.rows.map((r) => <RunRow key={r.run_id} row={r} />)}</ul>
          )}

          {/* The oversight layer's own health. A registration whose contract no
              longer validates means an agent is being quietly EXCLUDED from every
              oversight count, which is the worst-shaped failure this layer has —
              so it is stated, not hidden behind a green tick. */}
          {runs?.meta.oversight && runs.meta.oversight.length > 0 && (
            <div className="border-t border-slate-100 px-3 py-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                What oversight is watching
              </div>
              <ul className="mt-1 space-y-1">
                {runs.meta.oversight.map((o) => (
                  <li key={o.agent_key} className="text-[11px]">
                    <span className={o.healthy ? "text-slate-700" : "text-rose-700"}>
                      {o.display_name}
                    </span>
                    <span className="text-slate-500">
                      {" — "}
                      {o.last_checked_at ? `last checked ${when(o.last_checked_at)}` : "not checked yet"}
                      {o.active ? "" : " · switched off"}
                    </span>
                    {o.problem && <div className="text-rose-700">{o.problem}</div>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default AgentRunHistoryPanel;
