// SuggestionsCard — what the platform noticed, on the SPARK overview.
//
// Each row is a SENTENCE and a LINK. Pressing the link opens the screen that
// already has the work set up; pressing Done or Dismiss records what the owner
// decided about the suggestion, and neither of those makes the platform do
// anything on its own (L4, locked, even on Authority).
//
// THERE IS NO "APPLY" BUTTON HERE AND THERE MUST NEVER BE ONE. The value of a
// suggestion is that the owner can trust it not to have already happened. The
// moment one of these can act, every one of them has to be read defensively.
//
// The card renders nothing when there is nothing to say — an empty "Suggestions
// (0)" box on a dashboard is worse than no box, and SPARK Overview is
// deliberately a page that disappears when the owner is on top of things.

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Lightbulb, Loader2, X } from "lucide-react";
import { useLumenApi } from "../../hooks/useLumenApi";
import { IL_OWNER_PATHS, type IlSuggestion } from "../../lib/ilOwnerApi";

export function SuggestionsCard() {
  const { get, post, ready } = useLumenApi();
  const [rows, setRows] = useState<IlSuggestion[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    try {
      setRows(await get<IlSuggestion[]>(`${IL_OWNER_PATHS.suggestions}?status=open&limit=6`));
    } catch {
      // Quiet: this is an extra on a dashboard, not the dashboard.
      setRows([]);
    }
  }, [get, ready]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: number, verb: "done" | "dismiss") => {
    setBusy(id);
    try {
      await post(verb === "done" ? IL_OWNER_PATHS.suggestionDone(id) : IL_OWNER_PATHS.suggestionDismiss(id), {});
      setRows((cur) => (cur || []).filter((s) => s.suggestion_id !== id));
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (!rows || rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h2 className="text-sm font-semibold text-slate-900">Worth a look</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          {rows.length}
        </span>
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((s) => (
          <li key={s.suggestion_id} className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900">{s.title}</div>
                <p className="mt-0.5 text-xs text-slate-600">{s.body_plain}</p>
                <Link
                  to={s.action_url}
                  className="mt-1.5 inline-block text-xs font-semibold text-indigo-700 underline hover:text-indigo-900"
                >
                  {s.action_label}
                </Link>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  title="Done"
                  onClick={() => void decide(s.suggestion_id, "done")}
                  disabled={busy != null}
                  className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-1 text-[11px] font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {busy === s.suggestion_id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Done
                </button>
                <button
                  type="button"
                  title="Dismiss"
                  onClick={() => void decide(s.suggestion_id, "dismiss")}
                  disabled={busy != null}
                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  <X className="h-3 w-3" />
                  Dismiss
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default SuggestionsCard;
