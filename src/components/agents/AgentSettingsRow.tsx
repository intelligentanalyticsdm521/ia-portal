// AgentSettingsRow — one agent: what it does, whether it is on, its few knobs.
//
// Three shapes, one component, because they are the same row with different
// amounts of it filled in:
//   · a normal agent      switch + knobs
//   · a read-only agent   (oversight) no switch, just what it is doing
//   · an agent with its own settings page (the Responder) — a link, never a
//     second copy of its switches. Two places to set one thing is how they end
//     up disagreeing.
//
// The attribution line is `convention_audit_attribution_format`:
// "Created by Intelligent Analytics — <Agent>", written by the server so the
// name of the agent is never re-spelled in the Portal.
import { Link } from "react-router-dom";
import { Sparkles, ChevronRight, AlertTriangle, Play } from "lucide-react";
import type { AgentKnob, AgentSummary } from "./types";

interface Props {
  agent: AgentSummary;
  /** Knobs to show under the switch, in the owner's words. */
  knobs?: AgentKnob[];
  saving?: boolean;
  onToggle?: (enabled: boolean) => void;
  onKnob?: (field: string, value: number | string) => void;
  onResume?: () => void;
  /**
   * "Run it now". ARGUS pack 1 — the POC cannot wait for a weekly cron, and
   * Brandon cannot demo an agent whose only trigger is a Monday morning timer.
   * Omit it and no button renders (the oversight row has nothing to run by hand
   * that is not already the reindex).
   */
  onRunNow?: () => void;
  /** True while THIS row's run is in flight, so the button cannot be double-fired. */
  running?: boolean;
  /** Extra facts under the blurb (oversight: what it checked, when). */
  footnote?: string | null;
}

export function AgentSettingsRow({
  agent, knobs, saving, onToggle, onKnob, onResume, onRunNow, running, footnote,
}: Props) {
  const on = !!agent.enabled;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <div>
            <div className="text-sm font-semibold text-slate-900">{agent.label}</div>
            <p className="mt-0.5 max-w-2xl text-xs text-slate-600">{agent.blurb}</p>
            {footnote && <p className="mt-1 text-[11px] text-slate-500">{footnote}</p>}
            <p className="mt-1 text-[11px] text-slate-400">{agent.attribution}</p>
          </div>
        </div>

        {agent.settings_href ? (
          <Link
            to={agent.settings_href}
            className="flex flex-shrink-0 items-center gap-1 rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Its settings<ChevronRight className="h-3 w-3" />
          </Link>
        ) : agent.read_only ? (
          <div className="flex flex-shrink-0 items-center gap-3">
            {/* The oversight layer has no switch, but it still has something to do
                by hand - a reindex - and before ARGUS pack 1 it had neither a
                timer nor a button, so its footnote read "nothing to check yet"
                for ever. */}
            {onRunNow && (
              <button
                type="button"
                onClick={onRunNow}
                disabled={saving || running}
                className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40"
              >
                <Play className="h-3 w-3" />
                {running ? "Checking..." : "Check now"}
              </button>
            )}
            <span className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">Always on</span>
          </div>
        ) : (
          <div className="flex flex-shrink-0 items-center gap-3">
            {/* Only while it is ON and not paused. Running an agent that is
                switched off would either do nothing (confusing) or run it anyway
                (worse than confusing). */}
            {onRunNow && on && !agent.paused && (
              <button
                type="button"
                onClick={onRunNow}
                disabled={saving || running}
                className="inline-flex items-center gap-1 rounded border border-violet-300 bg-white px-2 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40"
              >
                <Play className="h-3 w-3" />
                {running ? "Running…" : "Run it now"}
              </button>
            )}
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={on}
                disabled={saving || !onToggle}
                onChange={(e) => onToggle?.(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              {on ? "On" : "Off"}
            </label>
          </div>
        )}
      </div>

      {agent.paused && (
        <div className="mt-2 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <span className="flex-1">
            {agent.paused_reason || "This one paused itself."}
          </span>
          {onResume && (
            <button
              onClick={onResume}
              disabled={saving}
              className="flex-shrink-0 rounded border border-amber-300 bg-white px-2 py-0.5 font-medium text-amber-800 disabled:opacity-40"
            >Start it again</button>
          )}
        </div>
      )}

      {on && agent.margin && (
        <div className={`mt-2 rounded border p-2 text-[11px] ${
          agent.margin.verdict === "cost_exceeds_60pct_of_price"
            ? "border-rose-200 bg-rose-50 text-rose-900"
            : agent.margin.verdict === "price_not_set"
              ? "border-slate-200 bg-slate-50 text-slate-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
        }`}>
          {agent.margin.message}
        </div>
      )}

      {on && knobs && knobs.length > 0 && (
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2">
          {knobs.map((k) => (
            <label key={k.field} className="block">
              <span className="block text-xs font-medium text-slate-800">{k.label}</span>
              {k.hint && <span className="mt-0.5 block text-[11px] text-slate-500">{k.hint}</span>}
              <span className="mt-1 flex items-center gap-2">
                {k.type === "text" ? (
                  <input
                    type="text"
                    value={agent.settings[k.field] == null ? "" : String(agent.settings[k.field])}
                    placeholder={k.placeholder}
                    disabled={saving || !onKnob}
                    onChange={(e) => onKnob?.(k.field, e.target.value)}
                    className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                ) : (
                  <input
                    type="number"
                    min={k.min}
                    max={k.max}
                    value={Number(agent.settings[k.field] ?? k.min ?? 0)}
                    disabled={saving || !onKnob}
                    onChange={(e) => onKnob?.(k.field, Number(e.target.value))}
                    className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                  />
                )}
                {k.suffix && <span className="text-[11px] text-slate-500">{k.suffix}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

export default AgentSettingsRow;
