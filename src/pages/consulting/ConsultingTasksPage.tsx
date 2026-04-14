import { useEffect, useState } from "react";
import { useConsultingApi } from "../../hooks/useConsultingApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface Task {
  id: number;
  title: string;
  status: string;
  engagement_name: string;
  engagement_type: string;
  due_date: string | null;
  description?: string;
}

interface ConsultingTasksPageProps {
  engagementType?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-gray-100 text-gray-700" },
  in_progress: { label: "In Progress", className: "bg-blue-100 text-blue-700" },
  needs_input: { label: "Needs Your Input", className: "bg-purple-100 text-purple-700" },
  complete: { label: "Complete", className: "bg-green-100 text-green-700" },
};

export function ConsultingTasksPage({ engagementType }: ConsultingTasksPageProps) {
  const { get, ready } = useConsultingApi();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const query = engagementType ? `?engagement_type=${encodeURIComponent(engagementType)}` : "";
        const raw = await get<{ data: Task[] }>(`/consulting/tasks${query}`);
        if (!cancelled) setTasks(raw?.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready, engagementType]);

  function formatDate(d: string | null) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function badge(status: string) {
    const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.upcoming;
    return (
      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.className}`}>
        {cfg.label}
      </span>
    );
  }

  const typeLabel = engagementType
    ? engagementType.replace(/^build_your_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "All";

  // Sort: needs_input first, then in_progress, upcoming, complete
  const sortOrder: Record<string, number> = { needs_input: 0, in_progress: 1, upcoming: 2, complete: 3 };
  const sorted = [...tasks].sort((a, b) => (sortOrder[a.status] ?? 9) - (sortOrder[b.status] ?? 9));

  return (
    <OliverPageWrapper
      title={`${typeLabel} Tasks`}
      subtitle="Tasks for your consulting engagement"
      error={error}
      loading={loading}
    >
      <div className="p-6 space-y-4">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="text-sm text-slate-600">No tasks found for this engagement.</p>
          </div>
        ) : (
          sorted.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl bg-white ring-1 p-5 ${
                t.status === "needs_input"
                  ? "ring-purple-300 bg-purple-50 border-l-4 border-[#7B1FA2]"
                  : "ring-gray-200"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 truncate">{t.title}</h3>
                    {badge(t.status)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.engagement_name}</p>
                  {t.description && (
                    <p className="mt-2 text-sm text-slate-600">{t.description}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-400">Due</p>
                  <p className="text-sm font-medium text-slate-700">{formatDate(t.due_date)}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </OliverPageWrapper>
  );
}
