// NeedsYouList — the waiting items, from one employee (their page) or from all
// three (ARGUS → Workflows → Needs you), contract ARGUS employees phase 1 §F.3–F.4.
//
// A source that could not be read says so, one line each with Try again; it is
// never shown as an empty list. The filter chips (Workflows only) narrow by
// employee and are kept in the URL by the page that owns them.
import { AlertTriangle } from "lucide-react";
import { NeedsYouCard } from "./NeedsYouCard";
import {
  EMPLOYEE_KEYS, EMPLOYEE_NAME, employeeOfRow,
  type EmployeeKey, type NeedsSource, type NeedsYouRow,
} from "../../../lib/team";
import type { DecideInput } from "../../../hooks/useNeedsYou";

interface Props {
  rows: NeedsYouRow[];
  failures: Array<{ source: NeedsSource; words: string }>;
  loading: boolean;
  /** job_key → its name on screen. */
  jobNames?: Record<string, string>;
  onDecide: (row: NeedsYouRow, which: "approve" | "skip" | "publish", input?: DecideInput) => Promise<{ ok: boolean; words: string }>;
  onRetry: () => void;
  /** Show the employee chips, with the one picked (null = everyone). */
  chips?: { picked: EmployeeKey | null; onPick: (k: EmployeeKey | null) => void } | null;
  emptyWords?: string;
}

export function NeedsYouList({ rows, failures, loading, jobNames, onDecide, onRetry, chips, emptyWords }: Props) {
  const shown = chips?.picked ? rows.filter((r) => employeeOfRow(r) === chips.picked) : rows;
  return (
    <div className="space-y-3">
      {chips && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Who it came from">
          <button
            type="button"
            onClick={() => chips.onPick(null)}
            aria-pressed={chips.picked === null}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${chips.picked === null ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300"}`}
          >
            Everyone
          </button>
          {EMPLOYEE_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => chips.onPick(k)}
              aria-pressed={chips.picked === k}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${chips.picked === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300"}`}
            >
              {EMPLOYEE_NAME[k]}
            </button>
          ))}
        </div>
      )}

      {failures.map((f) => (
        <div key={f.source} className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 ring-1 ring-rose-200" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1">{f.words}</span>
          <button type="button" onClick={onRetry} className="rounded border border-rose-300 px-2 py-0.5 font-semibold text-rose-800">
            Try again
          </button>
        </div>
      ))}

      {loading && rows.length === 0 && <p className="text-sm text-slate-500">Loading…</p>}
      {!loading && shown.length === 0 && failures.length === 0 && (
        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
          {emptyWords || "Nothing needs you right now."}
        </div>
      )}

      {shown.map((r) => (
        <NeedsYouCard
          key={`${r.source}:${r.agent}:${r.id}`}
          row={r}
          jobName={r.job_key ? jobNames?.[r.job_key] ?? null : null}
          onDecide={onDecide}
        />
      ))}
    </div>
  );
}

export default NeedsYouList;
