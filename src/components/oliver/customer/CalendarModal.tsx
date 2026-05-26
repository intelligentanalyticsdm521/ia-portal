/**
 * CalendarModal — full month calendar in a fixed-size Stripe-style modal.
 *
 * Replaces the standalone OliverSchedulePage as the primary calendar surface
 * (the page itself still exists for deep links but is no longer in the nav).
 * Reached from the Dashboard's "Upcoming jobs" card via "Open calendar".
 *
 * Same data source as the old SchedulePage (/schedule/calendar). Clicking
 * an event opens the unified CustomerModal with focusJobId so the user
 * stays in one mental model: jobs always live under a customer.
 */
import { useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../../hooks/useOliverApi";
import { DetailDrawer, Button } from "../ui";
import { CustomerModal } from "./CustomerModal";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  status: string;
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  scheduled:    { bg: "#DBEAFE", fg: "#1E40AF" },
  assigned:     { bg: "#CFFAFE", fg: "#0E7490" },
  dispatched:   { bg: "#CFFAFE", fg: "#0E7490" },
  in_progress:  { bg: "#FEF3C7", fg: "#B45309" },
  completed:    { bg: "#D1FAE5", fg: "#047857" },
  invoiced:     { bg: "#DBEAFE", fg: "#1E40AF" },
  paid:         { bg: "#D1FAE5", fg: "#047857" },
  cancelled:    { bg: "#FEE2E2", fg: "#B91C1C" },
  inquiry:      { bg: "#F3E8FF", fg: "#7E22CE" },
  quoted:       { bg: "#E0E7FF", fg: "#4338CA" },
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarModal({ onClose }: { onClose: () => void }) {
  const { get, post, patch, del, ready } = useOliverApi();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [focusJobId, setFocusJobId] = useState<string | null>(null);

  const startStr = currentMonth.toISOString().slice(0, 10);
  const endDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
  const endStr = endDate.toISOString().slice(0, 10);

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
    const map = new Map<number, CalendarEvent[]>();
    events.forEach((ev) => {
      const d = new Date(ev.date).getDate();
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(ev);
    });
    return map;
  }, [events]);

  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === currentMonth.getFullYear() && today.getMonth() === currentMonth.getMonth();

  function prevMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)); }
  function nextMonth() { setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)); }
  function gotoToday() { setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1)); }

  return (
    <>
      <DetailDrawer
        open
        onClose={onClose}
        size="fixed"
        title="Calendar"
        subtitle="All scheduled jobs"
        headerActions={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button variant="ghost" onClick={prevMonth}>‹</Button>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24", minWidth: 140, textAlign: "center" }}>
              {monthLabel}
            </div>
            <Button variant="ghost" onClick={nextMonth}>›</Button>
            <Button variant="secondary" onClick={gotoToday}>Today</Button>
          </div>
        }
      >
        {error && (
          <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        {/* Day-of-week header */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
          {DOW.map((d) => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5, padding: "4px 0" }}>
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {calendarDays.map((day, idx) => {
            const isToday = isCurrentMonth && day === today.getDate();
            const dayEvents = day ? (eventsByDay.get(day) || []) : [];
            return (
              <div
                key={idx}
                style={{
                  minHeight: 92,
                  borderRadius: 6,
                  background: day ? "#fff" : "transparent",
                  border: day ? `1px solid ${isToday ? "#1A7DB5" : "#E5E7EB"}` : "none",
                  padding: day ? 4 : 0,
                  display: "flex", flexDirection: "column", gap: 2,
                }}
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
                      const color = STATUS_COLORS[ev.status] || { bg: "#F1F5F9", fg: "#475569" };
                      return (
                        <button
                          key={ev.id}
                          onClick={() => setFocusJobId(ev.id)}
                          title={`${ev.title} · ${ev.status}`}
                          style={{
                            background: color.bg, color: color.fg,
                            border: "none", textAlign: "left",
                            padding: "2px 6px", borderRadius: 3,
                            fontSize: 10, fontWeight: 500,
                            cursor: "pointer",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {ev.title || "(untitled)"}
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
    </>
  );
}
