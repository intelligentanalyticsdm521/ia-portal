import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface DashboardStats {
  activeJobs: number;
  revenue: number;
  openInvoices: number;
  workers: number;
}

interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  timestamp: string;
}

export function OliverDashboardPage() {
  const { get, ready } = useOliverApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [s, a] = await Promise.all([
          get<DashboardStats>("/dashboard/stats"),
          get<ActivityEvent[]>("/dashboard/activity"),
        ]);
        if (!cancelled) {
          setStats(s);
          setActivity(a);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl bg-white ring-1 ring-gray-200 p-5 animate-pulse">
              <div className="h-4 w-20 bg-gray-200 rounded mb-3" />
              <div className="h-8 w-24 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5 animate-pulse">
          <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-gray-200 rounded mb-3" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 ring-1 ring-red-200 p-5 text-red-700">{error}</div>
      </div>
    );
  }

  const kpis = [
    { label: "Active Jobs", value: stats?.activeJobs ?? 0, color: "text-blue-600" },
    { label: "Revenue", value: `$${(stats?.revenue ?? 0).toLocaleString()}`, color: "text-green-600" },
    { label: "Open Invoices", value: stats?.openInvoices ?? 0, color: "text-amber-600" },
    { label: "Workers", value: stats?.workers ?? 0, color: "text-indigo-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
            <p className="text-sm text-slate-500">{k.label}</p>
            <p className={`mt-1 text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 p-5">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-500">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {activity.map((ev) => (
              <li key={ev.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-800">{ev.description}</p>
                  <p className="text-xs text-slate-400">{ev.type}</p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(ev.timestamp).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
