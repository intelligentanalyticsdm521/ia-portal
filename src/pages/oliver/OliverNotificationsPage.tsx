import { useEffect, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  timestamp: string;
}

export function OliverNotificationsPage() {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await get<ActivityEvent[]>("/dashboard/activity");
        if (!cancelled) setEvents(data.filter((e) => e.type === "notification" || e.type === "email"));
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [get, ready]);

  return (
    <OliverPageWrapper title="Notifications" subtitle="Email notification history" error={error} loading={loading}>

      <div className="rounded-xl bg-white ring-1 ring-gray-200 p-6">
        <h2 className="text-lg font-semibold text-slate-800">Notification History</h2>
        <p className="text-sm text-slate-500 mt-1">
          ACS email notifications are sent automatically when job statuses change, quotes are sent, or invoices become due.
          A full notification history view is coming soon.
        </p>
      </div>

      {events.length > 0 && (
        <div className="rounded-xl bg-white ring-1 ring-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Recent Notification Events
          </div>
          <ul className="divide-y divide-gray-100">
            {events.map((ev) => (
              <li key={ev.id} className="px-4 py-3 flex items-center justify-between">
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
        </div>
      )}
    </OliverPageWrapper>
  );
}
