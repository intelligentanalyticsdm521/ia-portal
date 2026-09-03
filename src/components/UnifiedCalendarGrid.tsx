// UnifiedCalendarGrid — F-130
//
// Month-grid calendar that reads from /calendar/unified (oliver-api) and
// renders every event color-coded by kind. Click a day cell → day-detail
// modal listing every event with deep-links into the source product.
//
// Used by:
//   - Command Center (Overview page — kinds=all)
//   - OLIVER Schedule page (kinds=job,booking — OLIVER-only)
//
// Pass `kinds` to filter (default = all). Pass `className` for sizing.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useOliverApi } from "../hooks/useOliverApi";
import { IadmModal } from "./IadmModal";

export interface UnifiedEvent {
  id: string;
  source: "oliver" | "spark" | "arion" | "consulting";
  kind: "job" | "booking" | "campaign" | "email" | "sms" | "social_post" | string;
  title: string;
  start: string;     // ISO
  end?: string | null;
  status?: string | null;
  sub_status?: string | null;
  contact_id?: number | null;
  contact_uuid?: string | null;
  ref_url?: string | null;
  color: string;
}

interface Props {
  /** Filter — comma-separated kinds, e.g. "job,booking". Empty = all. */
  kinds?: string;
  /** Optional className for outer wrapper. */
  className?: string;
  /** OLIVER multi-location: scope to one location_id. "all"/undefined = business-wide (unchanged). */
  locationId?: string | null;
  /**
   * 2026-09-02 — writability arrives as a PROP, not a fork.
   *
   * This grid is shared with the Command Center, where dropping a job onto a
   * day would be meaningless. Passing a handler is what turns the day cells
   * into drop targets; without one the grid behaves exactly as before.
   *
   * Return true if the drop was applied, so the grid knows whether to reload.
   */
  onDropJob?: (
    jobId: string,
    dateYmd: string,
    from?: { startIso: string; endIso?: string },
  ) => Promise<boolean>;
  /** Bump to force a reload — e.g. after scheduling from outside the grid. */
  reloadKey?: number;
  /**
   * Extra content for the day-detail modal, rendered above the event list.
   *
   * OLIVER passes a real day calendar here — an hour grid with jobs in place
   * and free time you can click — and it REPLACES the event list. The Command
   * Center passes nothing and keeps the plain list it has always had. Same
   * reason onDropJob is a prop: this grid serves two products and only one of
   * them schedules field work.
   */
  renderDayBody?: (dayKey: string, events: UnifiedEvent[], onDone: () => void) => React.ReactNode;
}

const KIND_LABEL: Record<string, string> = {
  job:     "Job",
  booking: "Booking",
  email:   "Email",
  sms:     "SMS",
  campaign:"Campaign",
  social_post: "Social Post",
};

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfGrid(d: Date) {
  // First day of grid = the Sunday on or before the 1st.
  const first = startOfMonth(d);
  const day = first.getDay(); // 0=Sun
  const start = new Date(first);
  start.setDate(first.getDate() - day);
  return start;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

export function UnifiedCalendarGrid({ kinds, className, locationId, onDropJob, reloadKey, renderDayBody }: Props) {
  const { get, ready } = useOliverApi();
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  // Grid is always 6 rows × 7 cols = 42 cells.
  const gridStart = useMemo(() => startOfGrid(cursor), [cursor]);
  const gridEnd = useMemo(() => addDays(gridStart, 41), [gridStart]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        start: ymd(gridStart),
        end: ymd(gridEnd),
      });
      if (kinds) qs.set("kinds", kinds);
      if (locationId && locationId !== "all") qs.set("location_id", locationId);
      // 2026-06-20 envelope fix: useOliverApi.get already strips the
      // {data:…} envelope (lib/oliverApi.ts:74 — see memory feedback
      // oliver_api_envelope_unwrap). Reading r.data?.events was always
      // undefined; the calendar silently rendered zero events even when
      // bookings/jobs were in range. Brandon's test booking appeared on
      // OLIVER Jobs board (separate endpoint) but never on the calendar —
      // this is why.
      // 2026-06-22 audit fix: also read errors_by_kind so a partial backend
      // failure (e.g. one of the per-kind SQL branches throws) surfaces as a
      // visible warning instead of a silently-empty grid. The previous
      // sub_status bug was invisible from the client side for two days
      // because the endpoint returned 200 with an empty events array.
      const r = await get<{ events: UnifiedEvent[]; errors_by_kind?: Array<{ kind: string; message: string }> }>(
        `/calendar/unified?${qs}`,
      );
      setEvents(r?.events || []);
      const errs = r?.errors_by_kind || [];
      if (errs.length) {
        setError(`Partial calendar load — ${errs.map((e) => `${e.kind}: ${e.message}`).join("; ")}`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [get, ready, gridStart, gridEnd, kinds, locationId, reloadKey]);

  useEffect(() => { load(); }, [load]);

  // Bucket events by YYYY-MM-DD (local date of start).
  const eventsByDay = useMemo(() => {
    const m: Record<string, UnifiedEvent[]> = {};
    for (const e of events) {
      const d = new Date(e.start);
      const key = ymd(d);
      if (!m[key]) m[key] = [];
      m[key].push(e);
    }
    return m;
  }, [events]);

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });
  const today = ymd(new Date());

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCursor(addDays(startOfMonth(cursor), -1))}
            className="p-1.5 rounded hover:bg-slate-100"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h3 className="text-lg font-bold text-slate-900 min-w-[180px] text-center">{monthLabel}</h3>
          <button
            onClick={() => setCursor(addDays(endOfMonth(cursor), 1))}
            className="p-1.5 rounded hover:bg-slate-100"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="ml-2 text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50"
          >
            Today
          </button>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {loading && <span className="text-slate-500">Loading…</span>}
          {dropping && <span className="text-slate-500">Scheduling…</span>}
          {/* 2026-06-22 audit fix: distinguish "loaded zero" from "still
              loading" / "errored" so Brandon's complaint pattern
              ("calendar is broken") is faster to triage. */}
          {!loading && !error && events.length === 0 && (
            <span className="text-slate-500">No scheduled jobs, bookings, campaigns, or social posts in this view</span>
          )}
          {!loading && events.length > 0 && (
            <span className="text-slate-500">{events.length} events this view</span>
          )}
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 border border-slate-200 rounded-t-lg overflow-hidden">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600 py-1.5 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 border-x border-b border-slate-200 rounded-b-lg overflow-hidden">
        {Array.from({ length: 42 }, (_, i) => {
          const day = addDays(gridStart, i);
          const dayKey = ymd(day);
          const inCurrentMonth = day.getMonth() === cursor.getMonth();
          const isToday = dayKey === today;
          const dayEvents = eventsByDay[dayKey] || [];

          return (
            <button
              key={dayKey}
              onClick={() => setOpenDay(dayKey)}
              // Drop handlers only bind when a handler was passed. On the
              // Command Center there is none, so this stays an ordinary button.
              onDragOver={onDropJob ? (e) => { e.preventDefault(); setDragOverDay(dayKey); } : undefined}
              onDragLeave={onDropJob ? () => setDragOverDay((d) => (d === dayKey ? null : d)) : undefined}
              onDrop={onDropJob ? async (e) => {
                e.preventDefault();
                setDragOverDay(null);
                const jobId = e.dataTransfer.getData("application/x-oliver-job-id");
                if (!jobId) return;   // something else was dragged; ignore it
                const fromStart = e.dataTransfer.getData("application/x-oliver-job-start") || undefined;
                const fromEnd = e.dataTransfer.getData("application/x-oliver-job-end") || undefined;
                // Dropped back on the day it already sits on — no write, no
                // toast, no reload. Saying "rescheduled" here would be a lie.
                if (fromStart && ymd(new Date(fromStart)) === dayKey) return;
                setDropping(true);
                try {
                  // Reload only if the caller says the write landed. Redrawing
                  // on a failed save would show the job on a day it is not on.
                  const from = fromStart ? { startIso: fromStart, endIso: fromEnd } : undefined;
                  if (await onDropJob(jobId, dayKey, from)) await load();
                } finally {
                  setDropping(false);
                }
              } : undefined}
              className={`bg-white min-h-[88px] p-1.5 text-left flex flex-col gap-0.5 transition-colors ${
                inCurrentMonth ? "" : "bg-slate-50"
              } hover:bg-slate-50 cursor-pointer ${
                isToday ? "ring-2 ring-inset ring-[#FEC82C]" : ""
              } ${dragOverDay === dayKey ? "ring-2 ring-inset ring-[#1A7DB5] bg-sky-50" : ""}`}
            >
              <div className={`text-[11px] font-medium ${
                inCurrentMonth ? "text-slate-700" : "text-slate-400"
              } ${isToday ? "text-[#1A3A4A] font-bold" : ""}`}>
                {day.getDate()}
              </div>
              <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((e) => {
                  // Only JOBS can be dragged, and only in writable mode. A
                  // campaign, email or social post on this grid is a scheduled
                  // SEND — dragging one to another day would quietly move when
                  // it goes out, which is not something to discover by accident.
                  const jobId = e.kind === "job" && e.id.startsWith("job:")
                    ? e.id.slice("job:".length)
                    : null;
                  const canDrag = !!onDropJob && !!jobId;
                  return (
                    <div
                      key={e.id}
                      title={canDrag ? `${e.title} — drag to another day to reschedule` : e.title}
                      draggable={canDrag}
                      onDragStart={canDrag ? (ev) => {
                        ev.stopPropagation();
                        ev.dataTransfer.setData("application/x-oliver-job-id", jobId!);
                        // Carry the original start so the drop can keep the
                        // time of day. Moving a 2pm job to Friday should leave
                        // it at 2pm, not reset it to the default hour.
                        ev.dataTransfer.setData("application/x-oliver-job-start", e.start);
                        // ...and the end, so a job that runs 2pm–5pm still runs
                        // three hours after the move instead of collapsing or
                        // stretching back to the old day.
                        if (e.end) ev.dataTransfer.setData("application/x-oliver-job-end", e.end);
                        ev.dataTransfer.effectAllowed = "move";
                      } : undefined}
                      className={`text-[9px] truncate rounded px-1 py-px font-medium text-white ${
                        canDrag ? "cursor-grab active:cursor-grabbing" : ""
                      }`}
                      style={{ background: e.color }}
                    >
                      {e.title}
                    </div>
                  );
                })}
                {dayEvents.length > 3 && (
                  <div className="text-[9px] text-slate-500 px-1">+{dayEvents.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded">
          Calendar failed to load: {error}
        </div>
      )}

      {/* Day detail modal */}
      {openDay && (
        <DayDetailModal
          dayKey={openDay}
          events={eventsByDay[openDay] || []}
          onClose={() => setOpenDay(null)}
          body={renderDayBody?.(openDay, eventsByDay[openDay] || [], () => { setOpenDay(null); void load(); })}
        />
      )}
    </div>
  );
}

function DayDetailModal({ dayKey, events, onClose, body }: {
  dayKey: string; events: UnifiedEvent[]; onClose: () => void; body?: React.ReactNode;
}) {
  const d = new Date(`${dayKey}T12:00:00`);
  const heading = d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <IadmModal
      open
      onClose={onClose}
      product="oliver"
      eyebrow="DAY DETAIL"
      title={heading}
      subtitle={`${events.length} event${events.length === 1 ? "" : "s"}`}
      size="info"
    >
      {/* A supplied body OWNS the day — OLIVER renders a real hour grid with the
          jobs in place, so the flat list below would be the same information
          twice. Without one, the list is the day view, unchanged. */}
      {body ? <div className="p-4">{body}</div> : (
      <div className="p-4 space-y-2">
        {events.map((e) => {
          const start = new Date(e.start);
          const end = e.end ? new Date(e.end) : null;
          const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
          const endTime = end ? end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
          const refUrl = e.ref_url;
          return (
            <div key={e.id} className="border-l-4 rounded-md bg-white border border-slate-200 p-3" style={{ borderLeftColor: e.color }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-px rounded text-white" style={{ background: e.color }}>
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                    <span className="text-[9px] font-bold uppercase text-slate-500">{e.source}</span>
                    {e.status && (
                      <span className="text-[10px] text-slate-600 capitalize">{e.status.replace(/_/g, " ")}</span>
                    )}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">{e.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {time}{endTime ? ` – ${endTime}` : ""}
                  </div>
                </div>
                {refUrl && (
                  <Link
                    to={refUrl}
                    onClick={onClose}
                    className="text-[11px] font-semibold text-blue-600 hover:underline whitespace-nowrap"
                  >
                    Open →
                  </Link>
                )}
              </div>
            </div>
          );
        })}
        {events.length === 0 && (
          <div className="text-center text-sm text-slate-500 py-8">Nothing scheduled this day.</div>
        )}
      </div>
      )}
    </IadmModal>
  );
}

export default UnifiedCalendarGrid;
