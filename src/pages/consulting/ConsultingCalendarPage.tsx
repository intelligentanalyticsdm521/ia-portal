import { useEffect, useState } from "react";
import { useConsultingApi } from "../../hooks/useConsultingApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

// B2/B3 fix (audit 2026-06-12): page was calling /consulting/events with
// fields {id, type, scheduled_at, duration_minutes} that the backend doesn't
// return. The canonical endpoint is /calendar/unified which returns
// {id, source, kind, title, start, end?, status, color} and already produces
// project_phase + project_target events (calendarUnified.js:173-234) plus
// engagement-level consulting events. Wired to that.
interface CalendarEvent {
  id: string;
  source: string;
  kind: string;
  title: string;
  start: string;
  end?: string | null;
  status?: string | null;
  color?: string | null;
}

const KIND_CONFIG: Record<string, { label: string; className: string }> = {
  project_phase:  { label: "Project Phase",  className: "bg-violet-100 text-violet-700" },
  project_target: { label: "Project Target", className: "bg-purple-100 text-purple-700" },
  discovery_call: { label: "Discovery Call", className: "bg-blue-100 text-blue-700" },
  qbr:            { label: "QBR",            className: "bg-purple-100 text-purple-700" },
  strategy_call:  { label: "Strategy Call",  className: "bg-teal-100 text-teal-700" },
  content_review: { label: "Content Review", className: "bg-amber-100 text-amber-700" },
};

export function ConsultingCalendarPage() {
  const { get, ready } = useConsultingApi();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 12-week window — wide enough to show current quarter + a peek into the next.
        const today = new Date();
        const start = today.toISOString().slice(0, 10);
        const end = new Date(today.getTime() + 84 * 86400_000).toISOString().slice(0, 10);
        const kinds = "project_phase,project_target,consulting";
        // 2026-06-20 envelope fix: useOliverApi.get auto-unwraps {data:…}.
        // Old code read raw?.data as if it were the events array, but
        // /calendar/unified returns {data: {events, range, counts_by_kind}}.
        // After auto-unwrap the client sees {events, range, counts_by_kind}.
        const raw = await get<{ events: CalendarEvent[] }>(`/calendar/unified?start=${start}&end=${end}&kinds=${kinds}`);
        if (!cancelled) setEvents(raw?.events ?? []);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  function typeBadge(kind: string) {
    const cfg = KIND_CONFIG[kind] ?? { label: kind.replace(/_/g, " "), className: "bg-gray-100 text-gray-700" };
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function formatDay(d: string) {
    return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  function monthKey(d: string) {
    const dt = new Date(d);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthLabel(key: string) {
    const [y, m] = key.split("-");
    const dt = new Date(Number(y), Number(m) - 1);
    return dt.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // Group by month
  const grouped = events.reduce<Record<string, CalendarEvent[]>>((acc, e) => {
    const key = monthKey(e.start);
    (acc[key] ??= []).push(e);
    return acc;
  }, {});

  const sortedMonths = Object.keys(grouped).sort();

  return (
    <OliverPageWrapper title="Consulting Calendar" subtitle="Scheduled events for your consulting engagements" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        {sortedMonths.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">No upcoming events scheduled.</p>
          </div>
        ) : (
          sortedMonths.map((mk) => (
            <div key={mk}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-purple-700">
                {monthLabel(mk)}
              </h2>
              <div className="space-y-3">
                {grouped[mk].map((e) => (
                  <div key={e.id} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{e.title}</h3>
                          {typeBadge(e.kind)}
                          {e.status && (
                            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600">
                              {e.status}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-slate-700">{formatDay(e.start)}</p>
                        {e.end && e.end !== e.start && (
                          <p className="text-xs text-slate-500">{formatTime(e.start)} – {formatTime(e.end)}</p>
                        )}
                        {(!e.end || e.end === e.start) && (
                          <p className="text-xs text-slate-500">{formatTime(e.start)}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </OliverPageWrapper>
  );
}
