// AssignWorkerPanel — pick someone for a job you just put on the calendar.
//
// Brandon's decision 3 (2026-09-02): default to UNASSIGNED and select manually.
// Rules — round robin, specific ordering, skill tags — are Pro and land in
// October with the capacity model. This is the manual half.
//
// It appears right after a job is scheduled, because that is when you know who
// should take it. Deliberately NOT bolted into the shared DayDetailModal: that
// component is used by the Command Center too, where assigning an OLIVER worker
// makes no sense.
//
// On the warning (decision 4: manual warns, automated blocks) — we do not yet
// know anyone's capacity. There is no capacity model until October. So this
// warns with the FACT we actually have: how many jobs that person already has
// that day. Saying "over capacity" would be inventing a limit nobody set.
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, UserPlus, X } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";

interface WorkerAvailability {
  worker_id: string;
  first_name?: string | null;
  last_name?: string | null;
  status?: string | null;
  assigned_count: number;
  assignments?: Array<{ title?: string | null; job_number?: string | null }>;
}

interface Props {
  jobId: string;
  /** YYYY-MM-DD the job was just scheduled for. */
  dateYmd: string;
  jobTitle?: string | null;
  onClose: () => void;
  /** Called after a successful assignment so the caller can refresh. */
  onAssigned?: () => void;
}

export function AssignWorkerPanel({ jobId, dateYmd, jobTitle, onClose, onAssigned }: Props) {
  const { get, post, ready } = useOliverApi();
  const [workers, setWorkers] = useState<WorkerAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gated, setGated] = useState(false);
  const [busyWorker, setBusyWorker] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await get<WorkerAvailability[]>(`/schedule/availability?date=${dateYmd}`);
      setWorkers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      const msg = apiErrorMessage(e);
      // /schedule/availability is Standard+. On Lite the calendar still works —
      // decision 5 gave everyone the calendar — but assignment does not, and
      // saying so plainly beats an error nobody can act on.
      if (/tier|upgrade|not available|feature/i.test(msg)) setGated(true);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }, [get, ready, dateYmd]);

  useEffect(() => { void load(); }, [load]);

  async function assign(w: WorkerAvailability) {
    setBusyWorker(w.worker_id);
    setError(null);
    try {
      await post("/dispatch/assign", { job_id: jobId, worker_id: w.worker_id });
      setAssigned(w.worker_id);
      onAssigned?.();
    } catch (e) {
      setError(`Couldn't assign that worker: ${apiErrorMessage(e)}`);
    } finally {
      setBusyWorker(null);
    }
  }

  const dayLabel = new Date(`${dateYmd}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });

  if (gated) return null;   // Lite: the calendar stays, assignment simply isn't offered.

  return (
    <div className="mb-3 rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-900">
            Assign someone{jobTitle ? ` to ${jobTitle}` : ""} — {dayLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600" title="Not now">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-2">
        {loading && <div className="px-1 py-2 text-xs text-slate-500">Checking who's free…</div>}

        {error && (
          <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
        )}

        {!loading && !error && workers.length === 0 && (
          <div className="px-1 py-2 text-xs text-slate-500">
            No active workers yet. Add your team under Team, then come back.
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {workers.map((w) => {
            const name = [w.first_name, w.last_name].filter(Boolean).join(" ") || "Unnamed worker";
            const busy = w.assigned_count > 0;
            const isAssigned = assigned === w.worker_id;
            return (
              <button
                key={w.worker_id}
                onClick={() => void assign(w)}
                disabled={busyWorker === w.worker_id || isAssigned}
                title={busy ? `Already has ${w.assigned_count} job${w.assigned_count === 1 ? "" : "s"} on ${dayLabel}` : "Free this day"}
                className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs disabled:opacity-60 ${
                  isAssigned
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : busy
                      ? "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400"
                      : "border-slate-200 bg-white text-slate-700 hover:border-[#1A7DB5]"
                }`}
              >
                {isAssigned ? <Check className="h-3 w-3" /> : busy ? <AlertTriangle className="h-3 w-3" /> : null}
                <span>{name}</span>
                {/* The number is the warning. We know how many jobs they have;
                    we do not know their limit, so we show the count and let a
                    person judge rather than asserting "over capacity". */}
                {busy && <span className="tabular-nums opacity-80">{w.assigned_count}</span>}
              </button>
            );
          })}
        </div>

        {assigned && (
          <div className="mt-2 text-[11px] text-emerald-700">
            Assigned. Pick another to add a second person, or close this.
          </div>
        )}
        {!loading && workers.some((w) => w.assigned_count > 0) && !assigned && (
          <div className="mt-2 text-[11px] text-amber-800">
            Amber means they already have work that day — the number is how much. You can still assign them.
          </div>
        )}
      </div>
    </div>
  );
}
