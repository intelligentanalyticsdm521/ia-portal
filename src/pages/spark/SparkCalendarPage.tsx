// @deprecated 2026-06-12 - orphan after refactor. Superseded by F-37 CalendarModal + cross-product calendar unified at oliver-api /calendar/unified. Confirm with founder before deletion (task #174).
import { useEffect, useState, useCallback, useMemo } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { SparkStatStrip } from "../../components/spark/SparkStatStrip";
import { SparkDrawer } from "../../components/spark/SparkDrawer";
import { SparkFilterPills } from "../../components/spark/SparkFilterPills";
import { Plus, Calendar as CalendarIcon, Mail, MessageSquare, Newspaper, Share2 } from "lucide-react";

interface FeedItem {
  source: string; id: number; title: string; kind: string; at: string; status: string | null;
}

const KIND_STYLES: Record<string, { color: string; icon: typeof Mail }> = {
  email: { color: "bg-blue-50 text-blue-800 border-blue-200", icon: Mail },
  sms: { color: "bg-purple-50 text-purple-800 border-purple-200", icon: MessageSquare },
  newsletter: { color: "bg-amber-50 text-amber-800 border-amber-200", icon: Newspaper },
  social: { color: "bg-pink-50 text-pink-800 border-pink-200", icon: Share2 },
  campaign: { color: "bg-blue-50 text-blue-800 border-blue-200", icon: Mail },
  event: { color: "bg-slate-50 text-slate-700 border-slate-200", icon: CalendarIcon },
};

export function SparkCalendarPage() {
  const { get, post, ready } = useSparkApi();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [filter, setFilter] = useState("all");
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
    await post("/api/v1/calendar-events", form);
    setForm({ title: "", event_type: "blog", starts_at: "", description: "" });
    setDrawerOpen(false);
    await load();
  }

  const filteredFeed = useMemo(() => {
    if (filter === "all") return feed;
    return feed.filter(f => f.kind === filter || f.source === filter);
  }, [feed, filter]);

  const byDay = useMemo(() => {
    const m: Record<string, FeedItem[]> = {};
    for (const f of filteredFeed) {
      const day = (f.at || "").slice(0, 10);
      if (!day) continue;
      m[day] = m[day] || [];
      m[day].push(f);
    }
    return m;
  }, [filteredFeed]);

  const days = Object.keys(byDay).sort();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <SparkPageShell
      title="Content Calendar"
      subtitle="Unified view: campaigns + social + newsletters + custom events"
      actions={
        <button onClick={() => setDrawerOpen(true)} className="spark-btn spark-btn-accent">
          <Plus className="h-3.5 w-3.5" /> Add event
        </button>
      }
      stats={
        <SparkStatStrip stats={[
          { label: "Total items", value: feed.length, icon: CalendarIcon },
          { label: "Campaigns", value: feed.filter(f => f.source === "campaign").length, accent: "blue", icon: Mail },
          { label: "Newsletters", value: feed.filter(f => f.kind === "newsletter").length, accent: "amber", icon: Newspaper },
          { label: "Social posts", value: feed.filter(f => f.source === "social").length, icon: Share2 },
        ]} />
      }
      filters={
        <SparkFilterPills
          active={filter}
          onChange={setFilter}
          pills={[
            { key: "all", label: "All", count: feed.length },
            { key: "campaign", label: "Campaigns", count: feed.filter(f => f.source === "campaign").length },
            { key: "newsletter", label: "Newsletters", count: feed.filter(f => f.kind === "newsletter").length },
            { key: "social", label: "Social", count: feed.filter(f => f.source === "social").length },
            { key: "event", label: "Events", count: feed.filter(f => f.source === "event").length },
          ]}
        />
      }
      loading={loading}
      error={error}
    >
      {days.length === 0 ? (
        <div className="spark-mini-card py-8 text-center">
          <CalendarIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <div className="text-sm text-slate-600">No events in the current window.</div>
          <div className="text-xs text-slate-500 mt-1">Schedule campaigns, newsletters, or social posts — they all appear here.</div>
        </div>
      ) : (
        <div className="space-y-4">
          {days.map(day => {
            const isToday = day === today;
            return (
              <div key={day} className="spark-mini-card">
                <div className="spark-mini-card-header">
                  <span className={`spark-mini-card-title ${isToday ? "text-emerald-700" : ""}`}>
                    {isToday && "▶ "}{new Date(day).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "short", day: "numeric" })}
                  </span>
                  <span className="text-xs text-slate-500">{byDay[day].length} item{byDay[day].length === 1 ? "" : "s"}</span>
                </div>
                <div className="space-y-1.5">
                  {byDay[day].map((f, i) => {
                    const style = KIND_STYLES[f.kind] || KIND_STYLES.event;
                    const Icon = style.icon;
                    return (
                      <div key={`${f.source}-${f.id}-${i}`} className={`flex items-center gap-2 border rounded-md px-3 py-1.5 text-sm ${style.color}`}>
                        <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="text-xs uppercase font-semibold w-20">{f.kind}</span>
                        <span className="flex-1 truncate">{f.title}</span>
                        {f.status && <span className="text-xs text-slate-600 capitalize">{f.status}</span>}
                        <span className="text-xs text-slate-500">{new Date(f.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SparkDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="New calendar event"
        subtitle="Plan content alongside scheduled campaigns + social posts"
        footer={
          <>
            <button onClick={() => setDrawerOpen(false)} className="spark-btn spark-btn-secondary">Cancel</button>
            <button onClick={createEvent} disabled={!form.title || !form.starts_at} className="spark-btn spark-btn-primary">Add event</button>
          </>
        }
      >
        <div className="spark-field">
          <label className="spark-field-label">Title</label>
          <input className="spark-field-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Spring sale announcement" autoFocus />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Type</label>
          <select className="spark-field-select" value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })}>
            <option value="email">Email send</option>
            <option value="sms">SMS</option>
            <option value="newsletter">Newsletter</option>
            <option value="social">Social post</option>
            <option value="blog">Blog post</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="spark-field">
          <label className="spark-field-label">When</label>
          <input type="datetime-local" className="spark-field-input" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} />
        </div>
        <div className="spark-field">
          <label className="spark-field-label">Description</label>
          <textarea className="spark-field-textarea" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
        </div>
      </SparkDrawer>
    </SparkPageShell>
  );
}

export default SparkCalendarPage;
