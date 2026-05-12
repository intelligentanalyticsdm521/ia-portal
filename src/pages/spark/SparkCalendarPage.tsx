import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";

interface FeedItem {
  source: string; id: number; title: string; kind: string; at: string; status: string | null;
}

const KIND_COLORS: Record<string, string> = {
  email: "bg-blue-100 text-blue-800 border-blue-300",
  sms: "bg-purple-100 text-purple-800 border-purple-300",
  newsletter: "bg-amber-100 text-amber-800 border-amber-300",
  social: "bg-pink-100 text-pink-800 border-pink-300",
  campaign: "bg-blue-100 text-blue-800 border-blue-300",
  event: "bg-gray-100 text-gray-800 border-gray-300",
};

export function SparkCalendarPage() {
  const { get, post, ready } = useSparkApi();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", event_type: "blog", starts_at: "", description: "" });

  const load = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: FeedItem[] }>("/api/v1/calendar/feed");
      setFeed(r.data || []);
    } catch (err) { setError(err); } finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { load(); }, [load]);

  async function createEvent() {
    if (!form.title || !form.starts_at) return;
    try {
      await post("/api/v1/calendar-events", form);
      setShowCreate(false);
      setForm({ title: "", event_type: "blog", starts_at: "", description: "" });
      await load();
    } catch (err) { setError(err); }
  }

  // Group by ISO date (yyyy-mm-dd)
  const byDay = useMemo(() => {
    const m: Record<string, FeedItem[]> = {};
    for (const f of feed) {
      const day = (f.at || "").slice(0, 10);
      if (!day) continue;
      m[day] = m[day] || [];
      m[day].push(f);
    }
    return m;
  }, [feed]);

  const days = Object.keys(byDay).sort();

  return (
    <OliverPageWrapper title="Content Calendar" subtitle="Unified view: campaigns + social + newsletters + custom events" error={error} loading={loading}>
      <div className="arion-page">
        <div className="card mb-4">
          <div className="card-hdr flex items-center justify-between">
            <div className="card-ttl">Feed</div>
            <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-md text-sm bg-blue-600 text-white">+ Add event</button>
          </div>
          <div className="p-4 space-y-4">
            {days.map(day => (
              <div key={day}>
                <div className="text-xs font-medium uppercase text-gray-500 mb-2 border-b border-gray-200 pb-1">{new Date(day).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}</div>
                <div className="space-y-1.5">
                  {byDay[day].map((f, i) => (
                    <div key={`${f.source}-${f.id}-${i}`} className={`flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm ${KIND_COLORS[f.kind] || "bg-gray-50 border-gray-200"}`}>
                      <span className="text-xs uppercase font-semibold w-20">{f.kind}</span>
                      <span className="flex-1 truncate">{f.title}</span>
                      {f.status && <span className="text-xs text-gray-600">{f.status}</span>}
                      <span className="text-xs text-gray-500">{new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {days.length === 0 && <div className="text-sm text-gray-500 text-center py-8">No events in the current window.</div>}
          </div>
        </div>

        {showCreate && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-5">
              <div className="text-lg font-semibold mb-3">New calendar event</div>
              <div className="space-y-3">
                <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="email">Email send</option>
                  <option value="sms">SMS</option>
                  <option value="newsletter">Newsletter</option>
                  <option value="social">Social post</option>
                  <option value="blog">Blog post</option>
                  <option value="other">Other</option>
                </select>
                <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
                <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={3} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-md text-sm border">Cancel</button>
                <button onClick={createEvent} className="px-3 py-1.5 rounded-md text-sm bg-emerald-600 text-white">Add</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </OliverPageWrapper>
  );
}

export default SparkCalendarPage;
