// NeedsSchedulingRail — the jobs that have no date on them yet.
//
// Walkthrough C6: "there is no schedule process — where do we go from the open
// job to actually get it on the schedule." Accepting a quote creates a job and
// then nothing points at it. Without this rail an unscheduled job is invisible
// until somebody remembers it exists, which is how appointments get missed.
//
// Drag a card onto a day in the calendar to schedule it. The rail owns the
// list; the calendar owns the drop. Scheduling itself is a PATCH on the job,
// the same field the job detail panel already writes — this adds a second way
// in, not a second source of truth.
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, RefreshCw } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { apiErrorMessage } from "../../lib/apiErrorMessage";

const PAGE_SIZE = 50;

export interface UnscheduledJob {
  job_id: string;
  job_number?: string | null;
  title?: string | null;
  status: string;
  customer_name?: string | null;
  contact_name?: string | null;
}

interface Props {
  /** Bump to reload — e.g. after a drop lands on the calendar. */
  reloadKey?: number;
  locationId?: string | null;
  /** Fired after the list loads so the page can show a count. */
  onCount?: (n: number) => void;
}

export function NeedsSchedulingRail({ reloadKey, locationId, onCount }: Props) {
  const { get, ready } = useOliverApi();
  const [jobs, setJobs] = useState<UnscheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ unscheduled: "1", per_page: String(PAGE_SIZE) });
      if (locationId && locationId !== "all") qs.set("location_id", locationId);
      // GET /jobs answers { data: [...], meta: { total } } and useOliverApi
      // strips the envelope, so this is the array itself. The meta — including
      // the true total — is discarded by that unwrap, which is why the count
      // below is capped rather than exact.
      const rows = await get<UnscheduledJob[]>(`/jobs?${qs}`);
      const list = Array.isArray(rows) ? rows : [];
      setJobs(list);
      onCount?.(list.length);
    } catch (e) {
      setError(apiErrorMessage(e));
      // An error is NOT an empty queue. Leave whatever was there and say so.
    } finally {
      setLoading(false);
    }
  }, [get, ready, locationId, onCount]);

  useEffect(() => { void load(); }, [load, reloadKey]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <CalendarPlus className="h-3.5 w-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-900">Needs scheduling</span>
          {/* PAGE_SIZE is the cap, and a full page means there may be more. Say
              "50+" rather than "50" — a badge that quietly under-reports the
              backlog is the kind of small lie that costs someone a job. */}
          {!loading && !error && (
            <span className="rounded-full bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white tabular-nums">
              {jobs.length >= PAGE_SIZE ? `${PAGE_SIZE}+` : jobs.length}
            </span>
          )}
        </div>
        <button
          onClick={() => void load()}
          className="text-slate-400 hover:text-slate-600"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      <div className="max-h-[520px] overflow-y-auto p-2">
        {loading && <div className="px-1 py-2 text-xs text-slate-500">Loading…</div>}

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            Couldn't load the queue: {error}
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="px-1 py-3 text-xs text-slate-500">
            Nothing waiting. Every job has a date on it.
          </div>
        )}

        {jobs.map((j) => (
          <div
            key={j.job_id}
            draggable
            onDragStart={(e) => {
              // A private type, so dropping anything else on the calendar is
              // ignored rather than half-handled.
              e.dataTransfer.setData("application/x-oliver-job-id", j.job_id);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="mb-1.5 cursor-grab rounded border border-slate-200 bg-white p-2 hover:border-[#1A7DB5] active:cursor-grabbing"
            title="Drag onto a day to schedule"
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-xs font-medium text-slate-900">
                {j.title || "Untitled job"}
              </span>
              {j.job_number && (
                <span className="shrink-0 text-[10px] tabular-nums text-slate-400">{j.job_number}</span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="rounded bg-slate-100 px-1 py-px capitalize">{j.status}</span>
              {(j.customer_name || j.contact_name) && (
                <span className="truncate">{j.customer_name || j.contact_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
