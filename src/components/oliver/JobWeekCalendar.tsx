// JobWeekCalendar — the Job Board's Calendar view: one week, Mon–Sun.
//
// Brandon, W-OB-05: "most service clients will want to see their jobs as a
// calendar view so I'd suggest using the weekly default for calendar view of
// their jobs then doing the link to open the full calendar."
//
// Same feed as the Schedule page (GET /calendar/unified, jobs + booking
// requests), so this week and the full calendar always show the same cards in
// the same colours (src/oliver/jobStatusColors). The Schedule page's month grid
// is not a week view, so this is the one small week component; a click on a
// job calls back to the Job Board, which opens the same job panel its List
// rows open.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { withLocation } from "../../lib/oliverLocations";
import { apiErrorMessage } from "../../lib/apiErrorMessage";
import { jobColor, factsFromUnifiedEvent } from "../../oliver/jobStatusColors";
import { layoutLanes } from "../../oliver/calendarLanes";
import { JobColorGuide } from "./JobColors";

/** The /calendar/unified event fields this view reads. */
export interface WeekCalendarEvent {
  id: string;
  kind: string;
  title: string;
  start: string;
  end?: string | null;
  status?: string | null;
  job_id?: string | null;
  job_title?: string | null;
  customer_name?: string | null;
  worker_count?: number | null;
  reschedule_requested?: boolean | null;
}

export type JobHints = Map<string, { hasWorker?: boolean | null; customerAttention?: boolean | null }>;

interface Props {
  locationId?: string | null;
  reloadKey?: number;
  /** Open a job — the Job Board passes the handler its List rows use. */
  onOpenJob: (jobId: string) => void;
  /** Open a booking request that is not a job yet (confirmed on Service Requests). */
  // A booking request card opens THAT request on Service Requests (2026-09-25,
  // Brandon W-OB-05 / calendar walk step 13): the slot id rides in the link.
  onOpenRequest: (slotId?: string) => void;
  /** Facts from the board's own rows, keyed by lower-case job id — used when
   *  the calendar feed does not carry them. */
  hints?: JobHints;
  fullCalendarHref: string;
}

const HOUR_H = 48;
const DAYS = 7;

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
/** Monday 00:00 local of the week containing d. */
function mondayOf(d: Date) {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = r.getDay(); // 0 = Sun
  r.setDate(r.getDate() - ((dow + 6) % 7));
  return r;
}
const hhmm = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" });

export function jobIdOf(e: { id: string; kind: string; job_id?: string | null }): string | null {
  if (e.kind !== "job") return null;
  if (e.job_id) return e.job_id;
  return e.id.startsWith("job:") ? e.id.slice(4) : null;
}

export function JobWeekCalendar({ locationId, reloadKey, onOpenJob, onOpenRequest, hints, fullCalendarHref }: Props) {
  const { get, ready } = useOliverApi();
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [events, setEvents] = useState<WeekCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, DAYS), [weekStart]);

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    setError(null);
    try {
      // The feed's day bounds are UTC; ask a day either side and keep what
      // falls in this LOCAL week, so a Sunday-evening job is not dropped.
      const qs = new URLSearchParams({
        start: ymd(addDays(weekStart, -1)),
        end: ymd(weekEnd),
        kinds: "job,booking",
      });
      const r = await get<{ events: WeekCalendarEvent[] }>(withLocation(`/calendar/unified?${qs}`, locationId));
      setEvents(r?.events || []);
    } catch (e) {
      // A failed load is not an empty week — say so.
      setError(apiErrorMessage(e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [get, ready, weekStart, weekEnd, locationId, reloadKey]);

  useEffect(() => { void load(); }, [load]);

  const days = useMemo(() => Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const inWeek = useMemo(() => events.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= weekStart.getTime() && t < weekEnd.getTime();
  }), [events, weekStart, weekEnd]);

  // Hours shown: 7am–6pm, widened to take in anything booked outside them.
  const { startHour, endHour } = useMemo(() => {
    let lo = 7;
    let hi = 18;
    for (const e of inWeek) {
      const s = new Date(e.start);
      lo = Math.min(lo, s.getHours());
      const en = e.end ? new Date(e.end) : new Date(s.getTime() + 3600000);
      if (en.toDateString() === s.toDateString()) hi = Math.max(hi, en.getHours() + (en.getMinutes() ? 1 : 0));
      else hi = 24;
    }
    return { startHour: lo, endHour: Math.min(24, Math.max(hi, lo + 1)) };
  }, [inWeek]);

  const byDay = useMemo(() => {
    const m = new Map<string, WeekCalendarEvent[]>();
    for (const e of inWeek) {
      const k = ymd(new Date(e.start));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(e);
    }
    return m;
  }, [inWeek]);

  const todayKey = ymd(new Date());
  const isThisWeek = weekStart.getTime() === mondayOf(new Date()).getTime();
  // "Mon 21 – Sun 27 Sep 2026" / "Mon 28 Sep – Sun 4 Oct 2026". Built by hand:
  // toLocaleDateString with weekday + day gives "21 Mon" in en-US.
  const rangeLabel = (() => {
    const last = addDays(weekStart, DAYS - 1);
    const wd = (d: Date) => d.toLocaleDateString(undefined, { weekday: "short" });
    const mon = (d: Date) => d.toLocaleDateString(undefined, { month: "short" });
    const sameYear = weekStart.getFullYear() === last.getFullYear();
    const sameMonth = sameYear && weekStart.getMonth() === last.getMonth();
    const a = `${wd(weekStart)} ${weekStart.getDate()}${sameMonth ? "" : ` ${mon(weekStart)}`}${sameYear ? "" : ` ${weekStart.getFullYear()}`}`;
    const b = `${wd(last)} ${last.getDate()} ${mon(last)} ${last.getFullYear()}`;
    return `${a} – ${b}`;
  })();
  const totalH = (endHour - startHour) * HOUR_H;

  return (
    <div className="iadm-card">
      <div className="iadm-card-body">
        {/* Header — on the white card, so ink text is the readable choice here. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="rounded p-1.5 text-slate-700 hover:bg-slate-100 max-md:flex max-md:h-10 max-md:w-10 max-md:items-center max-md:justify-center"
              aria-label="Previous week"
              title="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="min-w-[200px] text-center text-base font-bold text-slate-900">{rangeLabel}</h3>
            <button
              type="button"
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="rounded p-1.5 text-slate-700 hover:bg-slate-100 max-md:flex max-md:h-10 max-md:w-10 max-md:items-center max-md:justify-center"
              aria-label="Next week"
              title="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekStart(mondayOf(new Date()))}
              disabled={isThisWeek}
              className="ml-1 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 max-md:min-h-[40px] max-md:px-3"
              title="Back to this week"
            >
              Today
            </button>
            <span className="text-[11px] text-slate-500">
              {loading ? "Loading…" : error ? "" : inWeek.length === 0 ? "Nothing scheduled this week" : `${inWeek.length} on the calendar this week`}
            </span>
          </div>
          <Link
            to={fullCalendarHref}
            className="text-xs font-semibold text-[#1A7DB5] hover:underline"
            title="The Schedule page: the whole month, with days you can open"
          >
            Open the full calendar →
          </Link>
        </div>

        {error && (
          <div className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            The calendar did not load: {error}
          </div>
        )}

        {/* The week. Scrolls sideways inside the card on a phone rather than
            pushing the page wider than the screen. */}
        <div className="overflow-x-auto">
          <div className="min-w-[720px] rounded-md border border-slate-200">
            {/* Day headings */}
            <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns: `56px repeat(${DAYS}, 1fr)` }}>
              <div />
              {days.map((d) => {
                const k = ymd(d);
                const isToday = k === todayKey;
                return (
                  <div key={k} className={`border-l border-slate-200 px-1 py-1.5 text-center ${isToday ? "bg-amber-50" : ""}`}>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${isToday ? "text-[#1A3A4A]" : "text-slate-500"}`}>
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </div>
                    <div className={`text-sm font-bold ${isToday ? "text-[#1A3A4A]" : "text-slate-800"}`}>{d.getDate()}</div>
                  </div>
                );
              })}
            </div>

            {/* Hours × days */}
            <div className="grid" style={{ gridTemplateColumns: `56px repeat(${DAYS}, 1fr)` }}>
              <div className="relative" style={{ height: totalH }}>
                {Array.from({ length: endHour - startHour }, (_, i) => (
                  <div key={i} className="absolute right-1 text-[10px] tabular-nums text-slate-400" style={{ top: i * HOUR_H + 2 }}>
                    {hourLabel(startHour + i)}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const k = ymd(d);
                const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startHour).getTime();
                const laned = layoutLanes(byDay.get(k) || [], (e) => ({
                  start: new Date(e.start).getTime(),
                  end: e.end ? new Date(e.end).getTime() : NaN,
                }));
                return (
                  <div key={k} className={`relative border-l border-slate-200 ${k === todayKey ? "bg-amber-50/40" : ""}`} style={{ height: totalH }}>
                    {Array.from({ length: endHour - startHour }, (_, i) => (
                      <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: i * HOUR_H }} />
                    ))}
                    {laned.map(({ item: e, lane, lanes }) => {
                      const s = new Date(e.start);
                      const en = e.end ? new Date(e.end) : null;
                      const top = ((s.getTime() - dayStart) / 3600000) * HOUR_H;
                      const dur = en && en.getTime() > s.getTime() ? en.getTime() - s.getTime() : 3600000;
                      const height = Math.max(26, (dur / 3600000) * HOUR_H - 2);
                      const jobId = jobIdOf(e);
                      const c = jobColor(factsFromUnifiedEvent(e, jobId ? hints?.get(jobId.toLowerCase()) : null));
                      const name = e.kind === "job" ? (e.job_title || e.title) : "Booking request";
                      const who = e.customer_name || "";
                      const when = `${hhmm(s)}${en ? `–${hhmm(en)}` : ""}`;
                      return (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => (jobId ? onOpenJob(jobId) : onOpenRequest(e.id.replace(/^booking:/, "")))}
                          className="absolute overflow-hidden rounded px-1.5 py-0.5 text-left text-[10px] leading-tight shadow-sm hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#1A7DB5]"
                          style={{
                            top: Math.max(0, top) + 1,
                            height,
                            left: `calc(${(lane / lanes) * 100}% + 2px)`,
                            width: `calc(${100 / lanes}% - 4px)`,
                            background: c.solid,
                            color: c.onSolid,
                          }}
                          title={`${when} · ${name}${who ? ` · ${who}` : ""}\n${c.label}: ${c.meaning}\n${jobId ? "Click to open the job" : "Click to confirm it on Service Requests"}`}
                        >
                          <div className="font-semibold">{hhmm(s)}</div>
                          <div className="truncate font-semibold">{name}</div>
                          {who && <div className="truncate opacity-90">{who}</div>}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <JobColorGuide />
      </div>
    </div>
  );
}
