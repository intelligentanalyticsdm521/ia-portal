/**
 * CalendarModal — full-month calendar in a fixed-size Stripe-style modal.
 *
 * Replaces the standalone OliverSchedulePage as the primary calendar surface
 * (the page itself still exists for deep links but is no longer in the nav).
 * Reached from the Dashboard's Weekly Glance + "Open calendar" link.
 *
 * Same data source as before (/schedule/calendar) but now consumes the
 * normalized event shape that includes booking_slot rows merged in.
 *
 * Two view modes:
 *   - month: classic month grid. Click a day → switch to day mode.
 *   - day:   hour timeline (6am-10pm) with per-worker columns. Click an
 *            occupied slot → opens CustomerModal on that job. Click an
 *            empty slot → launches the new-job flow (CustomerPickerModal)
 *            with the slot's date+time prefilled.
 *
 * Clicking a job event opens the unified CustomerModal with focusJobId so
 * the user stays in one mental model: jobs always live under a customer.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useOliverApi } from "../../../hooks/useOliverApi";
import { DetailDrawer, Button } from "../ui";
import { CustomerModal } from "./CustomerModal";
import { NewEntityLauncher } from "./NewEntityLauncher";
import { JobColorGuide } from "../JobColors";
import { jobColor, factsFromScheduleEvent } from "../../../oliver/jobStatusColors";
import { layoutLanes } from "../../../oliver/calendarLanes";

interface CalendarEvent {
  id: string;
  type?: "job" | "booking";
  title: string;
  /** alias of scheduled_start sent by backend for backward compat */
  date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  status: string;
  customer_name?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
  contact_id?: string | null;
  /** A pending reschedule request from the customer (2026-09-25). */
  reschedule_requested?: boolean | null;
}

// The drawer header is the dark ink gradient. The month label inherits the
// header's foreground and the ghost ‹ › / ← Month buttons read the header's
// foreground token (IadmModal HEADER_FG_VARS) — they were #0B1C24 on #0B1C24,
// invisible (Brandon, W-OB-05: "nothing in the head on the calendars is black").
// The arrows get a size bump so they read as buttons.
const ARROW = { fontSize: 14, fontWeight: 600 } as const;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Day View hour range — 6am to 10pm. Future enhancement: pull from
// tenant business hours / per-worker availability (F-39).
const DAY_VIEW_START_HOUR = 6;
const DAY_VIEW_END_HOUR = 22;
const HOUR_HEIGHT_PX = 56; // 56px per hour → 30min visible to the eye

// ─── tiny helpers ────────────────────────────────────────────────────────────
// The one job colour map (src/oliver/jobStatusColors) — Brandon's green /
// yellow / orange / blue, the same colours as the Schedule page and the Job
// Board. Replaces this file's own status table (bookings were purple).
function eventColor(ev: CalendarEvent) {
  const c = jobColor(factsFromScheduleEvent(ev));
  return { bg: c.solid, fg: c.onSolid, label: c.label, meaning: c.meaning };
}
function eventStart(ev: CalendarEvent): Date | null {
  const raw = ev.scheduled_start || ev.date;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function eventEnd(ev: CalendarEvent): Date | null {
  const raw = ev.scheduled_end;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// Parse a YYYY-MM-DD string as a LOCAL date (midnight local), not UTC.
// `new Date("2026-05-27")` parses as UTC midnight, which in a CT browser
// displays as May 26 at 7pm — that off-by-one is the bug founder hit.
// Falls back to today (local midnight) when input is missing/invalid.
function parseLocalDate(s?: string): Date {
  if (s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      const out = new Date(y, mo, d);
      if (!Number.isNaN(out.getTime())) return out;
    }
    // ISO-with-time fallback (preserves original offset interpretation)
    const fallback = new Date(s);
    if (!Number.isNaN(fallback.getTime())) return fallback;
  }
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function CalendarModal({
  onClose,
  initialDate,
}: {
  onClose: () => void;
  /** YYYY-MM-DD — when provided, calendar opens directly into Day View on
   *  this date so day-click handlers from Weekly Glance land in the right
   *  context. */
  initialDate?: string;
}) {
  const { get, post, patch, del, ready } = useOliverApi();
  const navigate = useNavigate();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode — month grid or single-day timeline.
  // If caller passed initialDate, start on day view so the click feels direct.
  const [view, setView] = useState<"month" | "day">(initialDate ? "day" : "month");
  const [selectedDay, setSelectedDay] = useState<Date>(() => parseLocalDate(initialDate));
  const [currentMonth, setCurrentMonth] = useState(() => {
    const seed = parseLocalDate(initialDate);
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });

  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  // New-job-from-slot launcher state. When the user clicks an empty timeslot
  // in Day View, we open the customer picker; once they pick (or create) a
  // customer we open CustomerModal in job-create mode with the slot's time
  // prefilled via prefillJob.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [prefillStart, setPrefillStart] = useState<string | null>(null);
  const [prefillCustomerId, setPrefillCustomerId] = useState<string | null>(null);
  /** The same customer as LUMEN addresses them — the only way to open a COMPANY. */
  const [prefillSubject, setPrefillSubject] = useState<{ kind: "company" | "person"; id: string } | null>(null);
  const [createMode, setCreateMode] = useState<"job" | "quote" | null>(null);

  // Fetch window covers the visible month even when in day view, so flipping
  // between days within the month doesn't trigger a refetch.
  // GET /schedule/calendar compares scheduled_start <= @end with @end a DATE
  // (midnight), so "end = the 30th" dropped every job ON the 30th — the last
  // day of every month was empty (pane test 25 Sep: JOB-99055 on Wed 30 Sep
  // missing). Ask up to the 1st of next month, and format the reader's own
  // calendar day rather than a UTC slice.
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const startStr = ymd(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1));
  const endStr = ymd(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const data = await get<CalendarEvent[]>(`/schedule/calendar?start=${startStr}&end=${endStr}`);
        if (!cancelled) setEvents(data || []);
      } catch (err) { if (!cancelled) setError((err as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [get, ready, startStr, endStr]);

  // Backend can return one row per (job, worker_assignment). For the month grid
  // and day chip display we dedupe by id — Day View keeps the full list so it
  // can render the same job under each worker column.
  const uniqueEvents = useMemo(() => {
    const seen = new Set<string>();
    const out: CalendarEvent[] = [];
    for (const ev of events) {
      const key = ev.id + "|" + (ev.worker_id || "");
      // For month/week views we want one chip per ev.id — collapse worker dupes.
      if (seen.has(ev.id)) continue;
      seen.add(key);
      seen.add(ev.id);
      out.push(ev);
    }
    return out;
  }, [events]);

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let d = 1; d <= daysInMonth; d++) days.push(d);
    return days;
  }, [currentMonth]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of uniqueEvents) {
      const start = eventStart(ev);
      if (!start) continue;
      const key = localDayKey(start);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = eventStart(a)?.getTime() || 0;
        const tb = eventStart(b)?.getTime() || 0;
        return ta - tb;
      });
    }
    return map;
  }, [uniqueEvents]);

  // Day-view events — DON'T dedupe by id (we want one row per worker assignment
  // so the per-worker column layout works).
  const selectedDayEvents = useMemo(() => {
    const key = localDayKey(selectedDay);
    const out: CalendarEvent[] = [];
    for (const ev of events) {
      const start = eventStart(ev);
      if (!start) continue;
      if (localDayKey(start) === key) out.push(ev);
    }
    out.sort((a, b) => (eventStart(a)?.getTime() || 0) - (eventStart(b)?.getTime() || 0));
    return out;
  }, [events, selectedDay]);

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentMonth.getFullYear() && today.getMonth() === currentMonth.getMonth();

  function prevMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); }
  function nextMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); }
  function gotoToday() {
    const t = new Date();
    setCurrentMonth(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(t);
  }
  function openDayView(year: number, month: number, day: number) {
    setSelectedDay(new Date(year, month, day));
    setView("day");
  }
  function prevDay() {
    const d = new Date(selectedDay); d.setDate(d.getDate() - 1);
    setSelectedDay(d);
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function nextDay() {
    const d = new Date(selectedDay); d.setDate(d.getDate() + 1);
    setSelectedDay(d);
    setCurrentMonth(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  // Launch new-job-from-slot flow. We compose a YYYY-MM-DDTHH:MM:00 local
  // datetime string (no timezone) and pass it through so JobCreatePanel
  // populates scheduled_start exactly as the user clicked.
  function launchNewJobAtSlot(hour: number, minute: number) {
    const d = new Date(selectedDay);
    d.setHours(hour, minute, 0, 0);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setPrefillStart(`${y}-${mo}-${da}T${hh}:${mm}`);
    setPickerOpen(true);
  }

  const dayLabel = selectedDay.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        size="fixed"
        title={view === "day" ? "Day View" : "Calendar"}
        subtitle={view === "day" ? dayLabel : "All scheduled jobs"}
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {view === "month" ? (
              <>
                <Button variant="ghost" onClick={prevMonth} aria-label="Previous month" title="Previous month" style={ARROW}>‹</Button>
                <div style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: "center" }}>
                  {monthLabel}
                </div>
                <Button variant="ghost" onClick={nextMonth} aria-label="Next month" title="Next month" style={ARROW}>›</Button>
                <Button variant="secondary" onClick={gotoToday} title="Back to today">Today</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setView("month")} title="Back to the month">← Month</Button>
                <Button variant="ghost" onClick={prevDay} aria-label="Previous day" title="Previous day" style={ARROW}>‹</Button>
                <div style={{ fontSize: 13, fontWeight: 600, minWidth: 200, textAlign: "center" }}>
                  {selectedDay.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <Button variant="ghost" onClick={nextDay} aria-label="Next day" title="Next day" style={ARROW}>›</Button>
                <Button variant="secondary" onClick={gotoToday} title="Back to today">Today</Button>
              </>
            )}
          </div>
        }
      >
        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {view === "month" ? (
          <MonthGrid
            calendarDays={calendarDays}
            currentMonth={currentMonth}
            today={today}
            isCurrentMonth={isCurrentMonth}
            eventsByDay={eventsByDay}
            onDayClick={openDayView}
            onEventClick={(ev) => {
              if (ev.type === "booking") {
                // Bookings drill to the day so user can see context.
                const start = eventStart(ev);
                if (start) openDayView(start.getFullYear(), start.getMonth(), start.getDate());
              } else {
                setFocusJobId(ev.id);
              }
            }}
          />
        ) : (
          <DayTimeline
            day={selectedDay}
            events={selectedDayEvents}
            onEventClick={(ev) => {
              if (ev.type === "job") setFocusJobId(ev.id);
              // A booking still waiting for confirmation is not a job yet: it
              // opens where it is confirmed. It used to do nothing at all —
              // Brandon's "I can't click the multi-service fixture job" (W-OB-05).
              else navigate(`/app/services/oliver_service_requests?request=${encodeURIComponent(String(ev.id).replace(/^booking:/, ""))}`);
            }}
            onEmptySlotClick={launchNewJobAtSlot}
          />
        )}

        <JobColorGuide />

        {loading && (
          <div style={{ marginTop: 14, textAlign: "center", color: "#5A7A8A", fontSize: 12 }}>
            Loading calendar…
          </div>
        )}
      </DetailDrawer>

      {focusJobId && (
        <CustomerModal
          focusJobId={focusJobId}
          onClose={() => setFocusJobId(null)}
          api={{ get, post, patch, del }}
        />
      )}

      {pickerOpen && (
        <NewEntityLauncher
          defaultKind="job"
          api={{ get, post }}
          onCancel={() => { setPickerOpen(false); setPrefillStart(null); }}
          onResolved={({ customerId, kind, subject }) => {
            setPrefillCustomerId(customerId);
            setPrefillSubject(subject ?? null);
            setCreateMode(kind);
            setPickerOpen(false);
          }}
        />
      )}

      {createMode && (prefillCustomerId || prefillSubject) && (
        <CustomerModal
          customerId={prefillCustomerId || undefined}
          customerKind={prefillSubject?.kind}
          customerLumenId={prefillSubject?.id}
          initialSection={createMode === "quote" ? "quotes" : "jobs"}
          initialCreating={createMode}
          prefillJob={createMode === "job" && prefillStart ? { scheduled_start: prefillStart } : undefined}
          onClose={() => {
            setCreateMode(null);
            setPrefillCustomerId(null);
            setPrefillStart(null);
          }}
          api={{ get, post, patch, del }}
        />
      )}
    </>
  );
}

// ─── Month grid ──────────────────────────────────────────────────────────────
function MonthGrid({
  calendarDays,
  currentMonth,
  today,
  isCurrentMonth,
  eventsByDay,
  onDayClick,
  onEventClick,
}: {
  calendarDays: (number | null)[];
  currentMonth: Date;
  today: Date;
  isCurrentMonth: boolean;
  eventsByDay: Map<string, CalendarEvent[]>;
  onDayClick: (year: number, month: number, day: number) => void;
  onEventClick: (ev: CalendarEvent) => void;
}) {
  return (
    <>
      {/* Day-of-week header */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 0" }}>
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {calendarDays.map((day, idx) => {
          const isToday = isCurrentMonth && day === today.getDate();
          const key = day ? localDayKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)) : "";
          const dayEvents = day ? (eventsByDay.get(key) || []) : [];
          return (
            <div
              key={idx}
              onClick={day ? () => onDayClick(currentMonth.getFullYear(), currentMonth.getMonth(), day) : undefined}
              style={{
                minHeight: 92,
                borderRadius: 6,
                background: day ? "#fff" : "transparent",
                border: day ? `1px solid ${isToday ? "#1A7DB5" : "#E5E7EB"}` : "none",
                padding: day ? 4 : 0,
                display: "flex", flexDirection: "column", gap: 2,
                cursor: day ? "pointer" : "default",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => { if (day) (e.currentTarget as HTMLDivElement).style.background = "#F8FAFC"; }}
              onMouseLeave={(e) => { if (day) (e.currentTarget as HTMLDivElement).style.background = "#fff"; }}
            >
              {day && (
                <>
                  <div style={{
                    fontSize: 11, fontWeight: isToday ? 700 : 500,
                    color: isToday ? "#1A7DB5" : "#0B1C24",
                    padding: "2px 4px",
                  }}>
                    {day}
                  </div>
                  {dayEvents.slice(0, 3).map((ev) => {
                    const c = eventColor(ev);
                    const start = eventStart(ev);
                    const t = start ? fmtTime(start) : "";
                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                        title={`${t} · ${ev.title}${ev.customer_name ? ` · ${ev.customer_name}` : ""}${ev.type === "booking" ? " (booking request)" : ""}\n${c.label}: ${c.meaning}`}
                        style={{
                          background: c.bg, color: c.fg,
                          border: "none", textAlign: "left",
                          padding: "2px 6px", borderRadius: 3,
                          fontSize: 10, fontWeight: 500,
                          cursor: "pointer",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}
                      >
                        {t ? `${t} ` : ""}{ev.title || "(untitled)"}
                      </button>
                    );
                  })}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 10, color: "#5A7A8A", paddingLeft: 6 }}>+ {dayEvents.length - 3} more</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// ─── Day timeline ────────────────────────────────────────────────────────────
// Hour grid 6am-10pm, one row per hour, with absolutely-positioned event
// cards layered on top. Worker columns appear when 2+ workers have jobs on
// this day (Single-column otherwise to keep the layout calm). Empty rows
// are clickable → triggers the new-job-from-slot flow.
function DayTimeline({
  day,
  events,
  onEventClick,
  onEmptySlotClick,
}: {
  day: Date;
  events: CalendarEvent[];
  onEventClick: (ev: CalendarEvent) => void;
  onEmptySlotClick: (hour: number, minute: number) => void;
}) {
  // Collect distinct worker columns. If only 0-1 workers, use a single
  // "Unassigned / All" column to keep visual noise low.
  const workerColumns = useMemo(() => {
    const map = new Map<string, string>(); // worker_id → worker_name
    for (const ev of events) {
      if (ev.worker_id) map.set(ev.worker_id, ev.worker_name || "Worker");
    }
    const list = Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    if (list.length === 0) return [{ id: "__none__", name: "All jobs" }];
    if (list.length === 1) return [{ id: list[0].id, name: list[0].name }];
    // Add an "Unassigned" pseudo-column if any events have no worker.
    const hasUnassigned = events.some((e) => !e.worker_id);
    if (hasUnassigned) list.unshift({ id: "__none__", name: "Unassigned" });
    return list;
  }, [events]);

  const hours: number[] = [];
  for (let h = DAY_VIEW_START_HOUR; h <= DAY_VIEW_END_HOUR; h++) hours.push(h);

  const totalHeight = (DAY_VIEW_END_HOUR - DAY_VIEW_START_HOUR + 1) * HOUR_HEIGHT_PX;

  // Where to place an event card within a column.
  function eventPosition(ev: CalendarEvent) {
    const start = eventStart(ev);
    if (!start) return null;
    const end = eventEnd(ev) || new Date(start.getTime() + 60 * 60 * 1000);
    const startHourFloat = start.getHours() + start.getMinutes() / 60;
    const endHourFloat = end.getHours() + end.getMinutes() / 60;
    if (endHourFloat <= DAY_VIEW_START_HOUR || startHourFloat >= DAY_VIEW_END_HOUR + 1) return null;
    const top = Math.max(0, (startHourFloat - DAY_VIEW_START_HOUR)) * HOUR_HEIGHT_PX;
    const height = Math.max(20, (endHourFloat - startHourFloat) * HOUR_HEIGHT_PX);
    return { top, height };
  }

  // Events grouped per column.
  function eventsForColumn(colId: string): CalendarEvent[] {
    if (colId === "__none__") return events.filter((e) => !e.worker_id);
    return events.filter((e) => e.worker_id === colId);
  }

  const isToday = localDayKey(day) === localDayKey(new Date());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 0", borderBottom: "1px solid #E5E7EB",
      }}>
        <div style={{ fontSize: 12, color: "#5A7A8A" }}>
          {events.length === 0
            ? "No jobs scheduled — click any open slot to schedule a new one."
            : `${events.length} item${events.length === 1 ? "" : "s"} on the schedule. Click an open slot to add a new job.`}
        </div>
        {isToday && (
          <div style={{ fontSize: 11, color: "#1A7DB5", fontWeight: 600 }}>Today</div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${workerColumns.length}, 1fr)`, gap: 0, position: "relative" }}>
        {/* Hour gutter */}
        <div style={{ position: "relative" }}>
          {hours.map((h) => (
            <div
              key={h}
              style={{
                height: HOUR_HEIGHT_PX,
                fontSize: 10, color: "#94A3B8",
                paddingRight: 6, textAlign: "right",
                borderTop: "1px solid #F1F5F9",
              }}
            >
              {h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}
            </div>
          ))}
        </div>

        {/* Worker columns */}
        {workerColumns.map((col) => {
          const colEvents = eventsForColumn(col.id);
          return (
            <div key={col.id} style={{ position: "relative", borderLeft: "1px solid #F1F5F9" }}>
              {/* Column header */}
              <div style={{
                position: "sticky", top: 0, zIndex: 2,
                background: "#fff",
                fontSize: 11, fontWeight: 600, color: "#0B1C24",
                padding: "4px 8px",
                borderBottom: "1px solid #E5E7EB",
                textAlign: "center",
              }}>
                {col.name}
              </div>

              {/* Hour rows (background) */}
              {hours.map((h) => (
                <div
                  key={h}
                  onClick={() => onEmptySlotClick(h, 0)}
                  title={`Schedule new job at ${h === 12 ? "12 PM" : h > 12 ? `${h - 12} PM` : `${h} AM`}`}
                  style={{
                    height: HOUR_HEIGHT_PX,
                    borderTop: "1px solid #F1F5F9",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "#F8FAFC"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
                />
              ))}

              {/* Event cards layered on top of hour rows */}
              <div style={{
                position: "absolute", top: 28, left: 0, right: 0,
                height: totalHeight, pointerEvents: "none",
              }}>
                {/* Two jobs at the same time sit side by side; stacked, the one
                    underneath could not be clicked (W-OB-05). */}
                {layoutLanes(colEvents, (ev) => ({
                  start: eventStart(ev)?.getTime() ?? NaN,
                  end: eventEnd(ev)?.getTime() ?? NaN,
                })).map(({ item: ev, lane, lanes }) => {
                  const pos = eventPosition(ev);
                  if (!pos) return null;
                  const c = eventColor(ev);
                  const start = eventStart(ev);
                  const end = eventEnd(ev);
                  return (
                    <button
                      key={`${ev.id}-${col.id}`}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                      style={{
                        position: "absolute",
                        top: pos.top, height: pos.height,
                        left: `calc(${(lane / lanes) * 100}% + 4px)`,
                        width: `calc(${100 / lanes}% - 8px)`,
                        background: c.bg, color: c.fg,
                        border: `1px solid ${c.fg}33`,
                        borderRadius: 4,
                        padding: "4px 6px",
                        fontSize: 11, fontWeight: 500,
                        textAlign: "left",
                        cursor: "pointer",
                        pointerEvents: "auto",
                        overflow: "hidden",
                        display: "flex", flexDirection: "column", gap: 1,
                      }}
                      title={`${ev.title}${ev.customer_name ? ` · ${ev.customer_name}` : ""}\n${c.label}: ${c.meaning}\n${ev.type === "booking" ? "Click to confirm it on Service Requests" : "Click to open the job"}`}
                    >
                      <div style={{ fontSize: 10, opacity: 0.85 }}>
                        {start ? fmtTime(start) : ""}{end ? `–${fmtTime(end)}` : ""}
                        {ev.type === "booking" ? " · booking request" : ""}
                      </div>
                      <div style={{ fontWeight: 600, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {ev.title}
                      </div>
                      {ev.customer_name && (
                        <div style={{ fontSize: 10, opacity: 0.8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ev.customer_name}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
