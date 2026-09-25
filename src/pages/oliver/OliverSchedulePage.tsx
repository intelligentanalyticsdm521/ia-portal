// OliverSchedulePage — F-130 rewrite.
//
// Was a custom month-grid that pulled from /schedule/calendar (jobs only).
// Now uses UnifiedCalendarGrid (filtered to OLIVER kinds: job + booking)
// so the page shows scheduled jobs AND booking-page reservations on the
// same calendar. Same component is used on the Command Center for cross-
// product view.
//
// A slim KPI strip on top reads from the same /calendar/unified data so
// numbers match what's on the grid.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useOliverLocations } from "../../hooks/useOliverLocations";
import { withLocation } from "../../lib/oliverLocations";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader } from "../../components/oliver/ui";
import { UnifiedCalendarGrid, type UnifiedEvent, type EventPresentation } from "../../components/UnifiedCalendarGrid";
import { CustomerModal } from "../../components/oliver/customer/CustomerModal";
import { JobColorGuide } from "../../components/oliver/JobColors";
import { jobIdOf } from "../../components/oliver/JobWeekCalendar";
import { jobColor, factsFromUnifiedEvent } from "../../oliver/jobStatusColors";
import { NeedsSchedulingRail } from "../../components/oliver/NeedsSchedulingRail";
import { AssignWorkerPanel } from "../../components/oliver/AssignWorkerPanel";
import { DaySchedulePanel } from "../../components/oliver/DaySchedulePanel";
import { apiErrorMessage } from "../../lib/apiErrorMessage";

import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// How a job or booking chip looks on this page: the one job colour map
// (src/oliver/jobStatusColors — Brandon's green / yellow / orange / blue), the
// time and the job's own title rather than a truncated "JOB-99…".
function presentOliverEvent(e: UnifiedEvent): EventPresentation {
  const c = jobColor(factsFromUnifiedEvent(e));
  const time = new Date(e.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const name = e.kind === "job" ? (e.job_title || e.title) : "Booking request";
  const who = e.customer_name ? ` · ${e.customer_name}` : "";
  const num = e.kind === "job" && e.job_number ? `${e.job_number} · ` : "";
  return {
    background: c.solid,
    color: c.onSolid,
    label: `${time} ${name}`,
    tip: `${time} · ${num}${name}${who}\n${c.label}: ${c.meaning}`,
  };
}

export function OliverSchedulePage() {
  const insightsPayload = useProductInsightsPayload('oliver').payload;
  const { get, post, patch, del, ready } = useOliverApi();
  const navigate = useNavigate();
  const loc = useOliverLocations();
  // The job opened from the calendar — the same job panel the Job Board's
  // List rows open (Brandon W-OB-05: "in the full calendar I can't click the
  // … job to open"). A chip click opens it; so does a block in the day view.
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const openEvent = useCallback((e: { id: string; kind: string; job_id?: string | null }) => {
    const jobId = jobIdOf(e);
    if (jobId) setFocusJobId(jobId);
    // A booking still waiting for confirmation is not a job yet; it is
    // confirmed (or declined) on Service Requests.
    else if (e.kind === "booking") navigate(`/app/services/oliver_service_requests?request=${encodeURIComponent(e.id.replace(/^booking:/, ""))}`);
  }, [navigate]);
  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  // The page-wide "Loading…" is for the first load only: OliverPageWrapper
  // swaps the whole page for it, so a refetch after a drop or a change in the
  // job panel unmounted the calendar — it jumped back to this month and the
  // open day closed. Later refetches update the tiles in place.
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // One counter drives both panes: a drop reloads the calendar AND the rail, so
  // the job leaves the queue at the same moment it appears on a day.
  const [reloadKey, setReloadKey] = useState(0);
  const [scheduleNote, setScheduleNote] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  // The job just placed on a day, so we can offer assignment while the user is
  // still thinking about it. Cleared when they close the panel or drop another.
  const [justScheduled, setJustScheduled] = useState<{ jobId: string; dateYmd: string } | null>(null);

  // KPI data: fetch a 90-day window once for the strip on top so it
  // doesn't churn as the grid month changes.
  const now = useMemo(() => new Date(), []);
  const windowStart = useMemo(() => {
    const d = new Date(now); d.setDate(d.getDate() - 7); return d;
  }, [now]);
  const windowEnd = useMemo(() => {
    const d = new Date(now); d.setDate(d.getDate() + 60); return d;
  }, [now]);

  const loadKpis = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({
        start: ymd(windowStart),
        end: ymd(windowEnd),
        kinds: "job,booking",
      });
      // 2026-06-20 envelope fix: useOliverApi.get auto-unwraps the
      // {data:...} envelope (lib/oliverApi.ts:74). Reading r.data?.events
      // was always undefined → KPI strip showed 0/0/0/0 and the schedule
      // grid stayed empty.
      const r = await get<{ events: UnifiedEvent[] }>(withLocation(`/calendar/unified?${qs}`, loc.selectedLocationId));
      setEvents(r?.events || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [get, ready, windowStart, windowEnd, loc.selectedLocationId]);

  useEffect(() => { loadKpis(); }, [loadKpis]);

  // Drop a queued job onto a day. Writes the SAME field the job detail panel
  // writes (scheduled_start) — a second way in, not a second source of truth.
  const scheduleJobOnDay = useCallback(async (
    jobId: string,
    dateYmd: string,
    from?: { startIso: string; endIso?: string },
  ) => {
    setScheduleNote(null);
    try {
      const [y, m, d] = dateYmd.split("-").map(Number);
      const prev = from ? new Date(from.startIso) : null;

      // Moving an existing job KEEPS its time of day: a 2pm job dragged to
      // Friday is still at 2pm. Only a job coming out of the queue — which has
      // no time yet — gets the 9am default, because a job "at 00:00" reads as
      // unscheduled to a person.
      const start = prev
        ? new Date(y, m - 1, d, prev.getHours(), prev.getMinutes(), 0)
        : new Date(y, m - 1, d, 9, 0, 0);

      const body: Record<string, unknown> = { scheduled_start: start.toISOString() };

      // Shift the end by the same amount so the job keeps its length. Without
      // this a rescheduled job still ENDS on its old day and spans the gap.
      if (prev && from?.endIso) {
        const prevEnd = new Date(from.endIso);
        if (!Number.isNaN(prevEnd.getTime())) {
          body.scheduled_end = new Date(prevEnd.getTime() + (start.getTime() - prev.getTime())).toISOString();
        }
      }

      await patch(`/jobs/${jobId}`, body);
      setReloadKey((k) => k + 1);
      loadKpis();
      // Only offer assignment for a job that just came OUT OF THE QUEUE. A
      // reschedule usually already has someone on it, and re-prompting every
      // time you nudge a job across the calendar would be noise.
      if (!prev) setJustScheduled({ jobId, dateYmd });
      setScheduleNote({
        kind: "ok",
        text: prev
          ? `Moved to ${start.toLocaleDateString()}, still at ${start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
          : `Scheduled for ${start.toLocaleDateString()} at 9:00 AM. Open the job to change the time.`,
      });
      return true;
    } catch (e) {
      // Report the failure and DO NOT redraw: showing the job on a day it was
      // never saved to is worse than the error.
      setScheduleNote({ kind: "err", text: `Couldn't move that job: ${apiErrorMessage(e)}` });
      return false;
    }
  }, [patch, loadKpis]);

  const today = useMemo(() => ymd(new Date()), []);
  const todayCount = events.filter((e) => e.start.slice(0, 10) === today).length;
  const upcomingCount = events.filter((e) => new Date(e.start) > new Date()).length;
  const bookingCount = events.filter((e) => e.kind === "booking").length;
  const jobCount = events.filter((e) => e.kind === "job").length;

  return (
    <OliverPageWrapper title="Schedule" subtitle="Jobs + booking-page reservations" error={error} loading={loading && !loadedOnce}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_booked_ahead', label: 'Booked ahead' },
        { id: 'oliver_job_reliability', label: 'Ran clean vs not' },
      ]} />
      <PageHeader title="Schedule" subtitle="Drag a job from Needs scheduling onto a day. Open the job to set the time or assign a worker." />

      {/* KPI strip — last 7d to next 60d */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCard label="Today" value={todayCount} color="#FEC82C" />
        <KpiCard label="Upcoming (60d)" value={upcomingCount} color="#3B82F6" />
        <KpiCard label="Jobs" value={jobCount} color="#3B82F6" />
        {/* A confirmed booking is shown as its job (calendarUnified.js), so
            what is left under bookings is requests waiting to be confirmed. */}
        <KpiCard label="Booking requests" value={bookingCount} color="#FEC82C" />
      </div>

      {scheduleNote && (
        <div className={`mb-3 rounded-md border p-2.5 text-xs ${
          scheduleNote.kind === "ok"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {scheduleNote.text}
        </div>
      )}

      {/* Assignment is offered right after scheduling — that is when you know
          who should take it. Nothing is auto-assigned (decision 3). */}
      {justScheduled && (
        <AssignWorkerPanel
          jobId={justScheduled.jobId}
          dateYmd={justScheduled.dateYmd}
          onClose={() => setJustScheduled(null)}
          onAssigned={() => { setReloadKey((k) => k + 1); loadKpis(); }}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr]">
        <NeedsSchedulingRail reloadKey={reloadKey} locationId={loc.selectedLocationId} />
        <div className="iadm-card">
          <div className="iadm-card-body">
            <UnifiedCalendarGrid
              kinds="job,booking"
              locationId={loc.selectedLocationId}
              onDropJob={scheduleJobOnDay}
              reloadKey={reloadKey}
              present={presentOliverEvent}
              onEventClick={openEvent}
              // Clicking a day opens a real day calendar — hours down the side,
              // jobs in place, free time you can click into. Only OLIVER passes
              // this; the Command Center's day modal stays the plain event list.
              renderDayBody={(dayKey, dayEvents, onDone) => (
                <DaySchedulePanel
                  dayKey={dayKey}
                  events={dayEvents}
                  onDone={() => { onDone(); setReloadKey((k) => k + 1); loadKpis(); }}
                  onOpenEvent={openEvent}
                />
              )}
            />
            <JobColorGuide />
          </div>
        </div>
      </div>

      {focusJobId && (
        <CustomerModal
          focusJobId={focusJobId}
          onClose={() => setFocusJobId(null)}
          onChanged={() => { setReloadKey((k) => k + 1); loadKpis(); }}
          api={{ get, post, patch, del }}
        />
      )}
    </OliverPageWrapper>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border-2 bg-white px-4 py-3" style={{ borderLeftColor: color, borderLeftWidth: 4 }}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">{value}</div>
    </div>
  );
}

export default OliverSchedulePage;
