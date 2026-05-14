// SparkRealtimeMetricsPage — Live activity dashboard (v4.5).
//
// Polls /api/v1/usage/realtime every 10 seconds (configurable). Renders:
//  - 8 large metric tiles for today's running totals
//  - 5 inline sparklines for the last 60 minutes per channel
//  - Open-alerts summary per severity
//
// A pause toggle stops polling for when the page is idle in the
// background.
import { useCallback, useEffect, useRef, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { Sparkline } from "../../components/iainsights/Sparkline";
import {
  Activity, Mail, MessageSquare, FormInput, UserPlus, Briefcase,
  Webhook, AlertCircle, Pause, Play, RefreshCw, Clock,
} from "lucide-react";

interface Bucket { bucket: string; n: number }
interface RealtimeData {
  generated_at: string;
  window_minutes: number;
  today: {
    emails_today?: number;
    sms_today?: number;
    form_submissions_today?: number;
    new_contacts_today?: number;
    new_leads_today?: number;
    activities_today?: number;
    webhook_deliveries_today?: number;
    alerts_today?: number;
  };
  by_minute: {
    email?: Bucket[];
    sms?: Bucket[];
    forms?: Bucket[];
    activity?: Bucket[];
    api?: Bucket[];
  };
  open_alerts: Array<{ severity: "info" | "warn" | "critical"; n: number }>;
}

const REFRESH_OPTIONS = [
  { label: "5s",  value: 5 },
  { label: "10s", value: 10 },
  { label: "30s", value: 30 },
  { label: "1m",  value: 60 },
  { label: "5m",  value: 300 },
];

// Map a Bucket[] → Sparkline-ready [{ period_end, score }] where score is
// just the count normalised to 0-100 by peak in the window. Sparkline
// already handles short series gracefully.
function toSparkline(buckets: Bucket[] | undefined): Array<{ period_end: string; score: number }> {
  if (!buckets || buckets.length === 0) return [];
  const max = Math.max(1, ...buckets.map((b) => b.n));
  return buckets.map((b) => ({ period_end: b.bucket, score: Math.round((b.n / max) * 100) }));
}

const SEV_COLOR: Record<string, string> = { info: "#2563EB", warn: "#EAB308", critical: "#DC2626" };

export function SparkRealtimeMetricsPage() {
  const { get, ready } = useSparkApi();
  const [data, setData] = useState<RealtimeData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshSeconds, setRefreshSeconds] = useState(10);
  const [paused, setPaused] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!ready) return;
    setRefreshing(true);
    try {
      const r = await get<RealtimeData>("/api/v1/usage/realtime?minutes=60");
      setData(r);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) { setError(err); }
    finally { setRefreshing(false); }
  }, [get, ready]);

  // Initial fetch
  useEffect(() => { fetchData(); }, [fetchData]);

  // Polling
  useEffect(() => {
    if (paused || !ready) {
      if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    const id = window.setInterval(fetchData, refreshSeconds * 1000);
    timerRef.current = id;
    return () => { window.clearInterval(id); };
  }, [paused, ready, refreshSeconds, fetchData]);

  const t = data?.today || {};
  const tiles: Array<{ key: string; label: string; icon: typeof Activity; value: number; color: string; sparkKey?: keyof RealtimeData["by_minute"] }> = [
    { key: "emails",      label: "Emails sent",         icon: Mail,          value: t.emails_today           || 0, color: "#2563EB", sparkKey: "email" },
    { key: "sms",         label: "SMS sent",            icon: MessageSquare, value: t.sms_today              || 0, color: "#0EA5E9", sparkKey: "sms" },
    { key: "forms",       label: "Form submissions",    icon: FormInput,     value: t.form_submissions_today || 0, color: "#16A34A", sparkKey: "forms" },
    { key: "contacts",    label: "New contacts",        icon: UserPlus,      value: t.new_contacts_today     || 0, color: "#EF6C33" },
    { key: "leads",       label: "New leads",           icon: Briefcase,     value: t.new_leads_today        || 0, color: "#9333EA" },
    { key: "activity",    label: "Activity events",     icon: Activity,      value: t.activities_today       || 0, color: "#64748B", sparkKey: "activity" },
    { key: "webhooks",    label: "Webhook deliveries",  icon: Webhook,       value: t.webhook_deliveries_today || 0, color: "#0F766E" },
    { key: "alerts",      label: "Anomaly alerts",      icon: AlertCircle,   value: t.alerts_today           || 0, color: "#DC2626" },
  ];

  const openAlerts = data?.open_alerts || [];
  const totalOpenAlerts = openAlerts.reduce((s, a) => s + a.n, 0);

  return (
    <SparkPageShell
      title="Real-Time Activity"
      subtitle={lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Loading…"}
      help="Live tenant activity counters polled from the LUMEN-API. Today's running totals plus per-minute sparklines for the last hour. Pause polling when the tab is in the background to save bandwidth."
      actions={
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[10px] text-slate-500">
            <Clock className="h-3 w-3" /> every
            <select
              value={refreshSeconds}
              onChange={(e) => setRefreshSeconds(parseInt(e.target.value))}
              className="ml-1 text-[10px] border border-slate-300 rounded px-1 py-0.5"
            >
              {REFRESH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => setPaused((p) => !p)}
            className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${paused ? "border-amber-300 bg-amber-50 text-amber-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
            title={paused ? "Resume auto-refresh" : "Pause auto-refresh"}
          >
            {paused ? <><Play className="h-3.5 w-3.5" /> Paused</> : <><Pause className="h-3.5 w-3.5" /> Pause</>}
          </button>
          <button
            onClick={fetchData}
            disabled={refreshing}
            className="text-xs px-2 py-1 rounded bg-[#EF6C33] text-white flex items-center gap-1 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh now
          </button>
        </div>
      }
      error={error}
    >
      {/* Tile grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          const buckets = tile.sparkKey ? data?.by_minute?.[tile.sparkKey] : undefined;
          const sparkData = toSparkline(buckets);
          return (
            <div key={tile.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-500 tracking-wide">
                  <Icon className="h-3 w-3" style={{ color: tile.color }} />
                  <span className="truncate">{tile.label}</span>
                </div>
              </div>
              <div className="text-3xl font-bold tabular-nums" style={{ color: tile.color }}>
                {tile.value.toLocaleString()}
              </div>
              {sparkData.length > 0 && (
                <div className="mt-2">
                  <Sparkline data={sparkData} color={tile.color} width={120} height={28} showBands={false} />
                  <div className="text-[9px] text-slate-400 mt-0.5">last 60 min</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Open alerts strip */}
      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase font-semibold text-slate-500 tracking-wide">
            <AlertCircle className="h-3 w-3" /> Open anomaly alerts
          </div>
          <span className="text-sm font-semibold text-slate-700 tabular-nums">{totalOpenAlerts}</span>
        </div>
        {totalOpenAlerts === 0 ? (
          <div className="text-xs italic text-slate-400 mt-1">No open alerts.</div>
        ) : (
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            {openAlerts.map((a) => {
              const color = SEV_COLOR[a.severity] || "#94A3B8";
              return (
                <div key={a.severity} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="text-slate-700">{a.severity}</span>
                  <span className="font-bold tabular-nums" style={{ color }}>{a.n}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {paused && (
        <div className="mt-3 rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800">
          Auto-refresh paused. Click "Resume" or "Refresh now" to update the numbers.
        </div>
      )}
    </SparkPageShell>
  );
}

export default SparkRealtimeMetricsPage;
