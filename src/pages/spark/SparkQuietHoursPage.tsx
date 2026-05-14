// SparkQuietHoursPage — Tenant-wide outbound-SMS quiet-hours config (v3.3).
//
// Configures the daily window during which outbound SMS is blocked or
// queued. Shows the live decision the gating service would make right now
// (`/check`) and a 24-segment clock-ring visualization of the configured
// allowed/blocked window.
import { useCallback, useEffect, useState } from "react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import { MoonStar, Save, Clock, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

type BlockAction = "queue" | "reject";

interface QuietHoursConfig {
  tenant_id: string;
  enabled: boolean;
  timezone: string;
  start_hour: number;
  end_hour: number;
  weekdays_only: boolean;
  block_action: BlockAction;
}

interface CheckResponse {
  blocked: boolean;
  action: "allowed" | "queue" | "reject";
  config: QuietHoursConfig;
}

const COMMON_TIMEZONES: string[] = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Athens",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
];

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

// Determines whether the given hour (in tenant TZ) is within the configured
// quiet window. Quiet window spans [start_hour, end_hour); end_hour < start_hour
// means the window wraps around midnight (e.g. 22:00-08:00 = quiet from 10 PM
// to 8 AM).
function isQuietAt(hour: number, startHour: number, endHour: number): boolean {
  if (startHour === endHour) return false;
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // wrap-around
  return hour >= startHour || hour < endHour;
}

export function SparkQuietHoursPage() {
  const { get, put, ready } = useSparkApi();

  const [config, setConfig] = useState<QuietHoursConfig | null>(null);
  const [check, setCheck] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const loadAll = useCallback(async () => {
    if (!ready) return;
    setLoading(true); setError(null);
    try {
      const r = await get<{ data: QuietHoursConfig }>("/api/v1/quiet-hours");
      setConfig(r?.data || null);
      try {
        const c = await get<CheckResponse>("/api/v1/quiet-hours/check");
        setCheck(c);
      } catch { setCheck(null); }
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get, ready]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function save() {
    if (!config) return;
    setSaving(true);
    try {
      await put<{ ok: boolean }>("/api/v1/quiet-hours", config);
      await loadAll();
    } catch (err) {
      alert(`Save failed: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return (
      <SparkPageShell
        title="Quiet Hours"
        subtitle="Loading…"
        help="Tenant-wide outbound-SMS quiet hours. During the configured window, SMS sends are either queued for later delivery or rejected outright."
        loading={loading}
        error={error}
      >
        <div />
      </SparkPageShell>
    );
  }

  const liveBlocked = check?.blocked === true;

  return (
    <SparkPageShell
      title="Quiet Hours"
      subtitle={config.enabled ? `Active · ${hourLabel(config.start_hour)} – ${hourLabel(config.end_hour)} · ${config.timezone}` : "Disabled"}
      help="Tenant-wide outbound-SMS quiet hours. During the configured window, SMS sends are either queued for later delivery or rejected outright. The live status below shows the decision the gating service would make right now."
      actions={
        <button onClick={loadAll} className="text-sm px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1">
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      }
      loading={loading}
      error={error}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <MoonStar className="h-4 w-4 text-[#EF6C33]" />
            <div className="text-sm font-semibold text-slate-900">Configuration</div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-800">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="accent-[#EF6C33]"
            />
            <span className="font-medium">Enable quiet hours</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Timezone</div>
              <select
                value={config.timezone}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                disabled={!config.enabled}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33] disabled:opacity-50"
              >
                {COMMON_TIMEZONES.includes(config.timezone) ? null : <option value={config.timezone}>{config.timezone}</option>}
                {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">Start hour</div>
              <select
                value={config.start_hour}
                onChange={(e) => setConfig({ ...config, start_hour: Number(e.target.value) })}
                disabled={!config.enabled}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33] disabled:opacity-50"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)} ({String(h).padStart(2, "0")}:00)</option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <div className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide mb-1">End hour</div>
              <select
                value={config.end_hour}
                onChange={(e) => setConfig({ ...config, end_hour: Number(e.target.value) })}
                disabled={!config.enabled}
                className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 focus:border-[#EF6C33] disabled:opacity-50"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{hourLabel(h)} ({String(h).padStart(2, "0")}:00)</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={config.weekdays_only}
              onChange={(e) => setConfig({ ...config, weekdays_only: e.target.checked })}
              disabled={!config.enabled}
              className="accent-[#EF6C33]"
            />
            <span>Weekdays only (Mon-Fri)</span>
          </label>

          <fieldset className="space-y-1.5">
            <legend className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">During quiet hours, blocked sends are…</legend>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="block_action"
                value="queue"
                checked={config.block_action === "queue"}
                onChange={() => setConfig({ ...config, block_action: "queue" })}
                disabled={!config.enabled}
                className="mt-0.5 accent-[#EF6C33]"
              />
              <span>
                <span className="font-medium">Queued</span>
                <span className="text-slate-500"> — held until the window ends, then delivered automatically.</span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="radio"
                name="block_action"
                value="reject"
                checked={config.block_action === "reject"}
                onChange={() => setConfig({ ...config, block_action: "reject" })}
                disabled={!config.enabled}
                className="mt-0.5 accent-[#EF6C33]"
              />
              <span>
                <span className="font-medium">Rejected</span>
                <span className="text-slate-500"> — the API returns an error and the send is not retried.</span>
              </span>
            </label>
          </fieldset>

          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              onClick={save}
              disabled={saving}
              className="text-sm px-4 py-1.5 rounded bg-[#EF6C33] text-white disabled:opacity-50 flex items-center gap-1.5"
            >
              {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          {/* Live status from /check */}
          <div className={`rounded-lg border p-4 ${liveBlocked ? "border-rose-200 bg-rose-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              {liveBlocked
                ? <XCircle className="h-4 w-4 text-rose-600" />
                : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">Right now</div>
            </div>
            <div className={`text-sm font-semibold ${liveBlocked ? "text-rose-900" : "text-emerald-900"}`}>
              Outbound SMS would be {liveBlocked ? "BLOCKED" : "ALLOWED"}
            </div>
            {check && (
              <div className="text-[11px] text-slate-600 mt-1">
                Action: <span className="font-mono">{check.action}</span>
              </div>
            )}
          </div>

          {/* 24-segment clock ring */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">24-hour window</div>
            </div>
            <ClockRing
              startHour={config.start_hour}
              endHour={config.end_hour}
              enabled={config.enabled}
            />
            <div className="mt-3 flex items-center justify-center gap-3 text-[10px] text-slate-600">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#EF6C33" }} /> Quiet
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ background: "#E2E8F0" }} /> Allowed
              </span>
            </div>
          </div>
        </aside>
      </div>
    </SparkPageShell>
  );
}

// 24-segment SVG clock ring. Each segment = 1 hour, colored orange (quiet)
// or slate (allowed). 12 o'clock is at the top (= 0 hour / midnight).
function ClockRing({ startHour, endHour, enabled }: { startHour: number; endHour: number; enabled: boolean }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 95;
  const innerR = 62;
  const segments = 24;
  const sweep = (2 * Math.PI) / segments;

  const arcPath = (i: number): string => {
    // Rotate so segment 0 is at top (-PI/2).
    const a0 = -Math.PI / 2 + i * sweep;
    const a1 = a0 + sweep;
    const x0o = cx + outerR * Math.cos(a0);
    const y0o = cy + outerR * Math.sin(a0);
    const x1o = cx + outerR * Math.cos(a1);
    const y1o = cy + outerR * Math.sin(a1);
    const x0i = cx + innerR * Math.cos(a0);
    const y0i = cy + innerR * Math.sin(a0);
    const x1i = cx + innerR * Math.cos(a1);
    const y1i = cy + innerR * Math.sin(a1);
    return `M${x0o},${y0o} A${outerR},${outerR} 0 0 1 ${x1o},${y1o} L${x1i},${y1i} A${innerR},${innerR} 0 0 0 ${x0i},${y0i} Z`;
  };

  return (
    <svg width="100%" viewBox={`0 0 ${size} ${size}`} style={{ maxWidth: 240 }}>
      {Array.from({ length: segments }, (_, h) => {
        const quiet = enabled && isQuietAt(h, startHour, endHour);
        return (
          <path
            key={h}
            d={arcPath(h)}
            fill={quiet ? "#EF6C33" : "#E2E8F0"}
            stroke="white"
            strokeWidth={1.5}
          >
            <title>{`${String(h).padStart(2, "0")}:00 — ${quiet ? "Quiet" : "Allowed"}`}</title>
          </path>
        );
      })}
      {/* Hour ticks 0/6/12/18 */}
      {[0, 6, 12, 18].map((h) => {
        const a = -Math.PI / 2 + h * sweep;
        const lx = cx + (outerR + 12) * Math.cos(a);
        const ly = cy + (outerR + 12) * Math.sin(a);
        return (
          <text
            key={h}
            x={lx}
            y={ly}
            fontSize="11"
            fontWeight="600"
            textAnchor="middle"
            dominantBaseline="central"
            fill="#64748B"
          >
            {h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}
          </text>
        );
      })}
      <text x={cx} y={cy} fontSize="11" fontWeight="600" textAnchor="middle" dominantBaseline="central" fill="#64748B">
        {enabled ? `${hourLabel(startHour)} – ${hourLabel(endHour)}` : "Disabled"}
      </text>
    </svg>
  );
}

export default SparkQuietHoursPage;
