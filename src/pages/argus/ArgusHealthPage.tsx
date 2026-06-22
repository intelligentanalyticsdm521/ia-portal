// ArgusHealthPage — v9.0 ARGUS IA Insights · Health page.
//
// Per spec §6.1: 4 gauges (Business Pulse, ARGUS Platform Score, Trend
// Score, Intelligence Score) + active-products indicator + 2 bar charts
// (Trend Breakdown 4 bars + Intelligence Breakdown 5 bars).
//
// ARGUS Platform Score = Trend 50% + Intelligence 50% (no cross-platform
// sub-score — cross-platform is the whole product).
import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { IAInsightsHeader } from "../../components/iainsights/IAInsightsHeader";
import { bandFromScore, type IAInsightsHeaderData } from "../../components/iainsights/types";

interface BusinessPulse {
  pulse: number | null;
  previous_pulse: number | null;
  components: { arion: number | null; spark: number | null; oliver: number | null };
  prior_components: { arion: number | null; spark: number | null; oliver: number | null };
  weights: { arion: number; spark: number; oliver: number };
}

const ARGUS_TRENDS = [
  { key: "automation_health", label: "Automation Health" },
  { key: "event_flow",        label: "Event Flow" },
  { key: "workflow_perf",     label: "Workflow Performance" },
  { key: "trigger_chains",    label: "Cross-Product Trigger Chains" },
];

const ARGUS_INTEL = [
  { key: "connectivity_health", label: "Platform Connectivity Health" },
  { key: "automation_roi",      label: "Automation ROI" },
  { key: "anomaly_detection",   label: "Event Volume Anomaly Detection" },
  { key: "data_quality",        label: "Cross-Platform Data Quality" },
  { key: "workflow_opt",        label: "Workflow Optimisation" },
];

export function ArgusHealthPage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [pulse, setPulse] = useState<BusinessPulse | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const platformBase = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!platformBase) return;
        const res = await globalThis.fetch(`${platformBase}/argus/business-pulse`, {
          headers: { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId },
        });
        if (res.ok && !cancelled) setPulse((await res.json())?.data || null);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const data: IAInsightsHeaderData = useMemo(() => {
    const pulseScore = pulse?.pulse ?? 0;
    const trendScore = pulseScore;  // ARGUS Trend = average of trend reports — placeholder uses pulse
    const intelScore = 0;            // Intelligence locked v2
    const platformScore = Math.round((trendScore * 0.5) + (intelScore * 0.5));
    return {
      product: "argus",
      overall: {
        score: pulseScore,
        previousScore: pulse?.previous_pulse ?? null,
        band: bandFromScore(pulseScore),
        state: pulseScore > 0 ? "ok" : "insufficient_data",
        message: "Composite of all active Platform Scores.",
      },
      platform: {
        score: platformScore,
        band: bandFromScore(platformScore),
        state: pulseScore > 0 ? "ok" : "insufficient_data",
        message: "ARGUS Platform Score = Trend 50% + Intelligence 50%.",
      },
      trend: {
        score: trendScore,
        band: bandFromScore(trendScore),
        state: trendScore > 0 ? "ok" : "insufficient_data",
        message: "Composite of 4 ARGUS Trend reports — Automation Health, Event Flow, Workflow Performance, Cross-Product Trigger Chains.",
      },
      intelligence: {
        score: intelScore,
        band: "unknown",
        state: "locked",
        message: "v2 — unlocks after 90 days of platform_events history.",
      },
      trendBreakdown: ARGUS_TRENDS.map((t) => ({
        key: t.key,
        label: t.label,
        score: 0,
        band: "unknown" as const,
        locked: t.key === "workflow_perf" || t.key === "trigger_chains",
        lockReason: t.key === "workflow_perf" || t.key === "trigger_chains" ? "Level 2 ARGUS tables — post-launch" : undefined,
        reportRoute: "/app/services/argus_trends",
      })),
      intelligenceBreakdown: ARGUS_INTEL.map((i) => ({
        key: i.key,
        label: i.label,
        score: 0,
        band: "unknown" as const,
        locked: true,
        lockReason: "v2 — 90 days history minimum",
        reportRoute: "/app/services/argus_intelligence",
      })),
      banners: [
        {
          severity: "info" as const,
          message: "ARGUS is the cross-platform intelligence layer. Health page summarises all active product scores — drill into Trends, Intelligence, or Cross-Platform for detail.",
        },
      ],
      meta: { generatedAt: new Date().toISOString(), tier: "pro" as const },
    };
  }, [pulse]);

  // ARGUS gets the active-products indicator instead of the 5th gauge.
  const activeProducts = useMemo(() => ([
    { key: "arion" as const, active: (pulse?.components?.arion ?? null) != null, score: pulse?.components?.arion ?? null },
    { key: "spark" as const, active: (pulse?.components?.spark ?? null) != null, score: pulse?.components?.spark ?? null },
    { key: "oliver" as const, active: (pulse?.components?.oliver ?? null) != null, score: pulse?.components?.oliver ?? null },
    { key: "stella" as const, active: false, score: null },  // STELLA not yet shipped
  ]), [pulse]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS IA Insights — Health</h1>
        <p className="text-sm text-slate-500 mt-0.5">Cross-platform intelligence layer. Aggregates every active Platform Score into the Business Pulse.</p>
      </div>
      <IAInsightsHeader data={data} mode="argus" activeProducts={activeProducts} />
    </div>
  );
}

export default ArgusHealthPage;
