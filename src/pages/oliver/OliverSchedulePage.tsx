import { useEffect, useState, useMemo } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button } from "../../components/oliver/ui";

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

export function OliverSchedulePage() {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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
      } catch (err) { if (!cancelled) setError(err); }
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

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  }
  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  }
  function goToday() {
    const now = new Date();
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
  }

  // Quick KPIs
  const totalThisMonth = events.length;
  const completed = events.filter((e) => ["completed", "invoiced", "paid"].includes(e.status)).length;
  const upcoming = events.filter((e) => new Date(e.date) > new Date()).length;
  const today = events.filter((e) => {
    const d = new Date(e.date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  return (
    <OliverPageWrapper title="Schedule" subtitle="Calendar view of scheduled jobs" error={error} loading={loading}>
      <PageHeader
        title="Schedule"
        subtitle="Monthly calendar view of every job, color-coded by status"
        actions={
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Button variant="secondary" onClick={prevMonth}>←</Button>
            <Button variant="secondary" onClick={goToday}>Today</Button>
            <Button variant="secondary" onClick={nextMonth}>→</Button>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", marginLeft: 8 }}>{monthLabel}</span>
          </div>
        }
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Today</div>
          <div className="stat-val">{today}</div>
          <div className="stat-delta neu">scheduled today</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">This month</div>
          <div className="stat-val">{totalThisMonth}</div>
          <div className="stat-delta neu">total jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Upcoming</div>
          <div className="stat-val">{upcoming}</div>
          <div className="stat-delta neu">future events</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Completed</div>
          <div className="stat-val" style={{ color: "#059669" }}>{completed}</div>
          <div className="stat-delta neu">done this month</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
          textAlign: "center", fontSize: 10, fontWeight: 600,
          color: "#5A7A8A", textTransform: "uppercase",
          background: "#f8fafc", padding: "10px 0",
          borderBottom: "1px solid #eef2f4",
        }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendarDays.map((day, i) => {
            const dayEvents = day ? eventsByDay.get(day) ?? [] : [];
            const isToday = day !== null
              && new Date().getDate() === day
              && new Date().getMonth() === currentMonth.getMonth()
              && new Date().getFullYear() === currentMonth.getFullYear();
            return (
              <div
                key={i}
                style={{
                  minHeight: 92,
                  borderBottom: "1px solid #eef2f4",
                  borderRight: "1px solid #eef2f4",
                  padding: 6,
                  background: day === null ? "#fafbfc" : "#fff",
                }}
              >
                {day !== null && (
                  <>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: 22, height: 22, borderRadius: "50%",
                      fontSize: 11, fontWeight: isToday ? 700 : 500,
                      background: isToday ? "#0C4A60" : "transparent",
                      color: isToday ? "#fff" : "#0B1C24",
                    }}>{day}</span>
                    <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayEvents.slice(0, 3).map((ev) => {
                        const c = STATUS_COLORS[ev.status] || { bg: "#E5E7EB", fg: "#374151" };
                        return (
                          <div key={ev.id} style={{
                            background: c.bg, color: c.fg,
                            fontSize: 10, padding: "2px 5px", borderRadius: 3,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          }}>
                            {ev.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > 3 && (
                        <span style={{ fontSize: 9, color: "#94A3B8" }}>+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </OliverPageWrapper>
  );
}
