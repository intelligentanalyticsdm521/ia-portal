// EngagementAlertCallout — the big top-of-dashboard call-out (Brandon
// 2026-07-26): every platform dashboard leads with its open engagement
// alerts, not just the home Alerts tab. Same feed (core.engagement_alert via
// LUMEN), filtered to one platform, top two by severity. Renders nothing
// when the tenant is in good shape — zero footprint is the success state.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useSparkApi } from "../../hooks/useSparkApi";
import { launchJourneyStep } from "../walkthroughs/walkthroughLaunchBus";

interface EngagementAlert {
  id: number;
  key: string;
  platform: string;
  severity: "setup" | "risk" | "stale";
  title: string;
  description: string;
  href?: string | null;
  walkthroughId?: string | null;
}

const STYLE: Record<EngagementAlert["severity"], { box: string; chip: string; label: string }> = {
  setup: { box: "border-sky-300 bg-sky-50", chip: "bg-sky-600", label: "GET SET UP" },
  risk:  { box: "border-rose-300 bg-rose-50", chip: "bg-rose-600", label: "NEEDS ATTENTION" },
  stale: { box: "border-amber-300 bg-amber-50", chip: "bg-amber-600", label: "GONE QUIET" },
};

export function EngagementAlertCallout({ platform }: { platform: "spark" | "oliver" | "arion" }) {
  const spark = useSparkApi();
  const [alerts, setAlerts] = useState<EngagementAlert[]>([]);

  const load = useCallback(async () => {
    if (!spark.ready) return;
    try {
      await spark.post("/api/v1/engagement-alerts/run", {}).catch(() => {});
      const r = await spark.get<{ data: { alerts: EngagementAlert[] } }>("/api/v1/engagement-alerts");
      setAlerts((r.data?.alerts || []).filter((a) => a.platform === platform).slice(0, 2));
    } catch { /* callout is additive — the dashboard renders regardless */ }
  }, [spark, platform]);

  useEffect(() => { load(); }, [load]);

  async function dismiss(id: number) {
    try {
      await spark.post(`/api/v1/engagement-alerts/${id}/dismiss`, {});
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch { /* leave visible */ }
  }

  if (!alerts.length) return null;
  return (
    <div className="space-y-2 mb-4">
      {alerts.map((a) => {
        const s = STYLE[a.severity] || STYLE.stale;
        return (
          <div key={a.id} className={`rounded-lg border-2 px-4 py-3 ${s.box}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold text-white flex-shrink-0 ${s.chip}`}>{s.label}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-slate-900">{a.title}</div>
                <div className="text-xs text-slate-600 mt-0.5">{a.description}</div>
                <div className="mt-2 flex items-center gap-3">
                  {a.walkthroughId && (
                    <button onClick={() => launchJourneyStep(a.walkthroughId!, "explain")}
                      className="rounded bg-[#0B1C24] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#123246]">
                      Show me how
                    </button>
                  )}
                  {a.href && <Link to={a.href} className="text-xs font-semibold underline text-slate-700">Open →</Link>}
                </div>
              </div>
              <button onClick={() => dismiss(a.id)} className="text-slate-400 hover:text-slate-700" aria-label="Dismiss alert">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default EngagementAlertCallout;
