import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";

interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  timestamp: string;
}

const TYPE_COLORS: Record<string, string> = {
  job_status: "bg-blue-50 text-blue-700",
  invoice: "bg-green-50 text-green-700",
  quote: "bg-amber-50 text-amber-700",
  payment: "bg-emerald-50 text-emerald-700",
  dispatch: "bg-indigo-50 text-indigo-700",
  notification: "bg-purple-50 text-purple-700",
  email: "bg-pink-50 text-pink-700",
};

export function OliverActivityLogPage() {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<ActivityEvent[]>("/dashboard/activity");
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load activity log");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-12 bg-gray-200 rounded animate-pulse" />
        ))}
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

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-slate-900">Activity Log</h1>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3">Event</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((ev) => (
              <tr key={ev.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-slate-800">{ev.description}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[ev.type] ?? "bg-gray-100 text-gray-600"}`}>
                    {ev.type.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                  {new Date(ev.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">No activity recorded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
