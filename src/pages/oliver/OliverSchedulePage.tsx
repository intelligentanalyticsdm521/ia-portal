import { useEffect, useState, useMemo } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  status: string;
}

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
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<CalendarEvent[]>(`/schedule/calendar?start=${startStr}&end=${endStr}`);
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
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

  return (
    <OliverPageWrapper title="Schedule" subtitle="Calendar view of scheduled jobs" error={error} loading={loading}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">&larr;</button>
          <span className="text-sm font-medium text-slate-700">{monthLabel}</span>
          <button onClick={nextMonth} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">&rarr;</button>
        </div>
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 uppercase bg-gray-50 py-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-t border-gray-100">
          {calendarDays.map((day, i) => {
            const dayEvents = day ? eventsByDay.get(day) ?? [] : [];
            const isToday = day !== null && new Date().getDate() === day && new Date().getMonth() === currentMonth.getMonth() && new Date().getFullYear() === currentMonth.getFullYear();
            return (
              <div
                key={i}
                className={`min-h-[80px] border-b border-r border-gray-100 p-1.5 ${day === null ? "bg-gray-50/50" : ""}`}
              >
                {day !== null && (
                  <>
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-blue-600 text-white font-bold" : "text-slate-600"}`}>
                      {day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div key={ev.id} className="truncate rounded bg-blue-50 px-1 py-0.5 text-[10px] text-blue-700">
                          {ev.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-slate-400">+{dayEvents.length - 3} more</span>
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
