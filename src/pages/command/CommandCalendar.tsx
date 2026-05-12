import { useEffect, useState, useCallback, useMemo } from "react";
import { useAppState } from "../../app/AppState";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";

interface UnifiedEvent {
  source: "oliver" | "spark";
  kind: string;
  id: string | number;
  title: string;
  at: string;
  status?: string | null;
}

interface OliverJob { job_id: string; title: string; status: string; scheduled_start_at: string; }
interface SparkFeedItem { source: string; id: number; title: string; kind: string; at: string; status: string | null; }

const KIND_COLORS: Record<string, string> = {
  job: "bg-blue-100 text-blue-800 border-blue-300",
  proposal: "bg-indigo-100 text-indigo-800 border-indigo-300",
  email: "bg-blue-100 text-blue-800 border-blue-300",
  sms: "bg-purple-100 text-purple-800 border-purple-300",
  newsletter: "bg-amber-100 text-amber-800 border-amber-300",
  social: "bg-pink-100 text-pink-800 border-pink-300",
  campaign: "bg-blue-100 text-blue-800 border-blue-300",
  event: "bg-gray-100 text-gray-800 border-gray-300",
};

export function CommandCalendar() {
  const { enabledServices } = useAppState();
  const oliver = useOliverApi();
  const spark = useSparkApi();

  const hasOliver = enabledServices.has("oliver_dashboard") || enabledServices.has("oliver_jobs");
  const hasSpark = enabledServices.has("spark_overview") || enabledServices.has("spark_contacts");

  const [events, setEvents] = useState<UnifiedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const next: UnifiedEvent[] = [];

    if (hasOliver && oliver.ready) {
      try {
        const r = await oliver.get<{ data: OliverJob[] }>("/jobs?upcoming=1&limit=50");
        for (const j of (r.data || [])) {
          if (!j.scheduled_start_at) continue;
          next.push({ source: "oliver", kind: "job", id: j.job_id, title: j.title, at: j.scheduled_start_at, status: j.status });
        }
      } catch { /* skip */ }
    }

    if (hasSpark && spark.ready) {
      try {
        const r = await spark.get<{ data: SparkFeedItem[] }>("/api/v1/calendar/feed");
        for (const f of (r.data || [])) {
          if (!f.at) continue;
          next.push({ source: "spark", kind: f.kind, id: f.id, title: f.title, at: f.at, status: f.status });
        }
      } catch { /* skip */ }
    }

    next.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    setEvents(next);
    setLoading(false);
    if (next.length === 0 && !hasOliver && !hasSpark) setError("No calendar sources subscribed yet.");
  }, [oliver, spark, hasOliver, hasSpark]);

  useEffect(() => { load(); }, [load]);

  const byDay = useMemo(() => {
    const m: Record<string, UnifiedEvent[]> = {};
    for (const ev of events) {
      const day = ev.at.slice(0, 10);
      if (!m[day]) m[day] = [];
      m[day].push(ev);
    }
    return m;
  }, [events]);

  const days = Object.keys(byDay).sort();

  return (
    <div className="space-y-4">
      <div className="iadm-card">
        <div className="iadm-card-body">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-base font-semibold">Unified calendar</h3>
            <div className="text-xs text-gray-500">{events.length} events across OLIVER + SPARK</div>
          </div>
          <div className="text-xs text-gray-500 mb-3">
            Google Calendar + Outlook sync coming next — OAuth setup required (manual step pending).
          </div>
          {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading…</div>}
          {error && <div className="text-sm text-rose-600 py-4 text-center">{error}</div>}
          {!loading && days.length === 0 && !error && <div className="text-sm text-gray-500 py-8 text-center">No upcoming events.</div>}
          <div className="space-y-4">
            {days.map(day => (
              <div key={day}>
                <div className="text-xs font-medium uppercase text-gray-500 mb-2 border-b border-gray-200 pb-1">
                  {new Date(day).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
                </div>
                <div className="space-y-1.5">
                  {byDay[day].map((ev, i) => (
                    <div key={`${ev.source}-${ev.id}-${i}`}
                      className={`flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm ${KIND_COLORS[ev.kind] || "bg-gray-50 border-gray-200"}`}>
                      <span className="text-xs uppercase font-semibold w-12">{ev.source}</span>
                      <span className="text-xs uppercase font-medium w-20">{ev.kind}</span>
                      <span className="flex-1 truncate">{ev.title}</span>
                      {ev.status && <span className="text-xs text-gray-600 capitalize">{ev.status}</span>}
                      <span className="text-xs text-gray-500">
                        {new Date(ev.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
