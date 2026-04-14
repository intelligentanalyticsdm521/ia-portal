import { useEffect, useState } from "react";
import { useConsultingApi } from "../../hooks/useConsultingApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface OverviewData {
  active_engagements: number;
  tasks_in_progress: number;
  needs_input: number;
  upcoming_events: number;
}

interface RecentTask {
  id: number;
  title: string;
  status: string;
  engagement_name: string;
  due_date: string | null;
}

interface UpcomingEvent {
  id: number;
  title: string;
  type: string;
  scheduled_at: string;
  duration_minutes: number;
}

export function ConsultingOverviewPage() {
  const { get, ready } = useConsultingApi();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [tasks, setTasks] = useState<RecentTask[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [oRaw, tRaw, eRaw] = await Promise.all([
          get<{ data: OverviewData }>("/consulting/overview"),
          get<{ data: RecentTask[] }>("/consulting/tasks?limit=5"),
          get<{ data: UpcomingEvent[] }>("/consulting/events?limit=5"),
        ]);
        if (!cancelled) {
          setOverview(oRaw?.data ?? null);
          setTasks(tRaw?.data ?? []);
          setEvents(eRaw?.data ?? []);
        }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  const hasEngagements = overview && overview.active_engagements > 0;

  const cards = overview
    ? [
        { label: "Active Engagements", value: overview.active_engagements },
        { label: "Tasks In Progress", value: overview.tasks_in_progress },
        { label: "Needs Your Input", value: overview.needs_input },
        { label: "Upcoming Events", value: overview.upcoming_events },
      ]
    : [];

  function statusBadge(status: string) {
    switch (status) {
      case "in_progress":
        return <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">In Progress</span>;
      case "needs_input":
        return <span className="inline-block rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Needs Your Input</span>;
      case "complete":
        return <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Complete</span>;
      default:
        return <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">Upcoming</span>;
    }
  }

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDateTime(d: string) {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  }

  return (
    <OliverPageWrapper title="Consulting Overview" subtitle="Your IA consulting engagement at a glance" error={error} loading={loading}>
      <div className="p-6 space-y-6">
        {!hasEngagements ? (
          <div className="rounded-xl border-2 border-dashed border-purple-300 bg-purple-50 p-8 text-center">
            <h2 className="text-lg font-semibold text-purple-900">IA Consulting Services</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-purple-700">
              Our consulting team helps you build your brand, foundation, clarity, and growth engine.
              From strategy sessions to deliverable reviews, we partner with you every step of the way.
            </p>
            <a
              href="https://iadm.co/consulting"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-block rounded-lg bg-[#7B1FA2] px-5 py-2.5 text-sm font-medium text-white hover:bg-purple-800 transition-colors"
            >
              Learn More
            </a>
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {cards.map((c) => (
                <div
                  key={c.label}
                  className="rounded-xl bg-white ring-1 ring-gray-200 p-5 border-l-4 border-[#7B1FA2]"
                >
                  <p className="text-sm text-slate-500">{c.label}</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Recent tasks */}
            <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Tasks</h2>
              {tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks yet.</p>
              ) : (
                <div className="space-y-3">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between rounded-lg p-3 ${
                        t.status === "needs_input" ? "bg-purple-50 ring-1 ring-purple-200" : "bg-gray-50"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{t.title}</p>
                        <p className="text-xs text-slate-500">{t.engagement_name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(t.status)}
                        <span className="text-xs text-slate-400">{formatDate(t.due_date)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming events */}
            <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Events</h2>
              {events.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming events.</p>
              ) : (
                <div className="space-y-3">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{e.title}</p>
                        <p className="text-xs text-slate-500">{e.duration_minutes} min</p>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTime(e.scheduled_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </OliverPageWrapper>
  );
}
