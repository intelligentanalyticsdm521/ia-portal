// LeadRuleChip — "Held by your rule: Ankeny only", right on the lead card.
//
// This is where the owner's own sentence comes back to them at the moment it
// matters. Three states, and nothing else:
//
//   · the rules did nothing to this inquiry   → the component renders nothing
//   · a rule moved it                          → the sentence, and by how much
//   · a rule is HOLDING it                     → the sentence, and two buttons
//
// THE TWO BUTTONS ARE THE FEATURE. "Take it anyway" and "Not this one" resolve
// the hold AND write a correction, which is the sales-playbook promise made
// real: "then it applies your rules to every inquiry, and every accept or
// decline sharpens it." One call does both (LUMEN
// POST /business-rules/lead/:id/resolve).
//
// L4: a hold is a LABEL. The inquiry is in the inbox, at the score it already
// had, openable, answerable. Nothing was dismissed, suppressed or deleted, and
// neither button makes the platform do anything to a customer.
//
// WHY IT IS ITS OWN COMPONENT: SparkLeadModal is 700 lines and other builders
// are in that file this week. The modal gets one import and one line — the same
// contract LeadCorrectionButtons took for IL-2. It also means the same chip can
// be dropped on an inbox row later without moving any of this logic.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Clock, Lightbulb, Loader2 } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { IL_OWNER_PATHS, type IlLeadRules } from "../../lib/ilOwnerApi";

interface Props {
  leadId: number;
  /** Called after a decision lands so the modal and the inbox re-read. */
  onChanged?: () => void;
}

export function LeadRuleChip({ leadId, onChanged }: Props) {
  const { get, post, ready } = useLumenApi();
  const [data, setData] = useState<IlLeadRules | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setData(await get<IlLeadRules>(IL_OWNER_PATHS.lead(leadId)));
    } catch {
      // Quiet on purpose, and ONLY here: this is a decoration on a lead card
      // that already works. An error banner over a card the owner opened to
      // read a phone number would be worse than the chip being absent.
      setData(null);
    }
  }, [get, ready, leadId]);

  useEffect(() => { void load(); }, [load]);

  const resolve = async (resolution: "accepted" | "declined") => {
    setBusy(resolution);
    setError(null);
    try {
      const r = await post<{ summary: string }>(IL_OWNER_PATHS.resolve(leadId), { resolution });
      setDone(r.summary);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not record that.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;
  const moves = data.applications.filter((a) => a.effect !== "hold");
  if (!data.held && moves.length === 0 && data.suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {data.held && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                Held by your rule
              </div>
              <p className="mt-0.5 text-xs text-amber-900">{data.held_reason}</p>
              <p className="mt-0.5 text-[11px] text-amber-800">
                Nothing has happened to it — it is here waiting for you either way.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void resolve("accepted")}
                  disabled={busy != null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {busy === "accepted" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Take it anyway
                </button>
                <button
                  type="button"
                  onClick={() => void resolve("declined")}
                  disabled={busy != null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                >
                  {busy === "declined" && <Loader2 className="h-3 w-3 animate-spin" />}
                  Not this one
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {moves.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Your rules
          </div>
          <ul className="mt-1 space-y-1">
            {moves.map((a) => (
              <li key={a.application_id} className="flex items-start gap-1.5 text-xs text-slate-700">
                {a.effect === "rank_up"
                  ? <ArrowUp className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                  : a.effect === "rank_down"
                    ? <ArrowDown className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
                    : <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />}
                <span>
                  {a.reason_plain}
                  {a.delta_points !== 0 && (
                    <span className="ml-1 tabular-nums text-slate-500">
                      ({a.delta_points > 0 ? "+" : ""}{a.delta_points})
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.suggestions.map((s) => (
        <Link
          key={s.suggestion_id}
          to={s.action_url}
          className="block rounded-lg border border-indigo-200 bg-indigo-50 p-3 hover:bg-indigo-100"
        >
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600" />
            <div>
              <div className="text-xs font-semibold text-indigo-900">{s.title}</div>
              <p className="mt-0.5 text-[11px] text-indigo-800">{s.body_plain}</p>
            </div>
          </div>
        </Link>
      ))}

      {done && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">{done}</div>
      )}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-800">{error}</div>
      )}
    </div>
  );
}

export default LeadRuleChip;
