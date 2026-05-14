// ArgusIntelligencePage — v9.5 LIVE for 3 of 5 reports.
//
// 5 reports per spec §6.3. The 3 reports that have a backing data
// source today (Platform Connectivity Health, Event Volume Anomaly
// Detection, Cross-Platform Data Quality) read live from platform-api
// endpoints. The 2 that need Level 2 ARGUS tables (workflow_registry,
// workflow_run_log) remain shells until those tables exist.
import { useEffect, useMemo, useState } from "react";
import { useAccessToken } from "../../auth/useAccessToken";
import { useAppState } from "../../app/AppState";
import { Lock, Network, DollarSign, AlertCircle, ShieldCheck, GitMerge, ArrowRight, X } from "lucide-react";

interface IntelReport {
  score: number;
  state: "ok" | "partial" | "insufficient_data" | "locked";
  headline: string;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  dataGap?: string;
}

interface ConnectivityHealthData {
  products: Array<{ source: string; total: number; processed: number; failed: number; success_rate: number | null }>;
}

interface AnomalyData {
  anomalies_count: number;
  top_anomalies: Array<{ event_type: string; day: string; volume: number; baseline_mean: number; z_score: number; direction: "spike" | "drop" }>;
  event_types_analyzed: number;
}

interface DataQualityData {
  orphan_jobs: number | null;
  unprocessed_forms: number | null;
  unattributed_contacts: number | null;
  stuck_platform_events: number | null;
}

const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const pct = (n: number | null | undefined, d = 0) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(d)}%`;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// ── Engines ──────────────────────────────────────────────────────────
function connectivityHealthEngine(data: ConnectivityHealthData | null): IntelReport {
  if (!data || !data.products || data.products.length === 0) {
    return { score: 0, state: "insufficient_data", headline: "No platform events", scoreInputs: [], observations: ["No platform events recorded yet."], actions: ["Verify the webhooks pipeline is delivering events to argus.platform_events."], dataGap: "Awaiting first events." };
  }
  if (data.products.length < 2) {
    return { score: 0, state: "partial", headline: `Only ${data.products[0]?.source} firing events`, scoreInputs: [{ key: "active_products", value: data.products.length, weight: 1.0 }], observations: ["Only one product is firing events. Connectivity requires at least 2 active products to be measurable."], actions: ["Connect a second product (SPARK or OLIVER) to unlock cross-product connectivity analysis."], dataGap: "Need a second active product." };
  }
  const avgSuccess = data.products.reduce((s, p) => s + (p.success_rate || 0), 0) / data.products.length;
  const obs = [`${data.products.length} active source products firing events.`];
  for (const p of data.products) {
    if (p.success_rate != null) obs.push(`${p.source}: ${fmt(p.total)} events · ${pct(p.success_rate, 1)} success rate.`);
  }
  if (avgSuccess < 0.9) obs.push(`Avg success rate of ${pct(avgSuccess, 1)} is below 90% — at least one product chain is failing. Investigate failed events by source.`);
  return {
    score: Math.round(clamp(avgSuccess * 100)),
    state: "ok",
    headline: `${data.products.length} products · ${pct(avgSuccess, 0)} avg success`,
    scoreInputs: data.products.map(p => ({ key: `${p.source}_success_pct`, value: Math.round((p.success_rate || 0) * 100), weight: 1.0 / data.products.length })),
    observations: obs,
    actions: avgSuccess < 0.9 ? ["Check argus.platform_events WHERE status='failed' grouped by source. Pattern-match errors and fix systemically."] : ["Connectivity is healthy. Monitor monthly for drift."],
  };
}

function eventAnomalyEngine(data: AnomalyData | null): IntelReport {
  if (!data) {
    return { score: 0, state: "insufficient_data", headline: "Loading…", scoreInputs: [], observations: [], actions: [] };
  }
  if (data.event_types_analyzed === 0) {
    return { score: 0, state: "insufficient_data", headline: "Need 60 days history", scoreInputs: [], observations: ["Anomaly detection needs 60+ days of platform events for a reliable baseline."], actions: ["Continue normal operations. Detection unlocks at 60+ days."], dataGap: "60 days of history needed." };
  }
  const anomalyCount = data.anomalies_count;
  const score = Math.round(clamp(100 - Math.min(anomalyCount * 10, 80)));
  const obs = [`Analyzed ${data.event_types_analyzed} event types over the period. Detected ${anomalyCount} anomalies (volume deviations > 2σ from baseline).`];
  if (data.top_anomalies && data.top_anomalies.length > 0) {
    const top = data.top_anomalies[0];
    obs.push(`Largest anomaly: ${top.event_type} ${top.direction} on ${top.day} — ${fmt(top.volume)} events vs ${fmt(top.baseline_mean)} baseline (${top.z_score > 0 ? "+" : ""}${top.z_score}σ).`);
    if (data.top_anomalies.length >= 3) {
      obs.push(`Top anomalous event types: ${data.top_anomalies.slice(0, 3).map(a => `${a.event_type} (${a.direction})`).join(", ")}.`);
    }
  } else {
    obs.push(`No significant anomalies — event volume is stable across all event types.`);
  }
  return {
    score,
    state: "ok",
    headline: anomalyCount === 0 ? "No anomalies detected" : `${anomalyCount} anomalies flagged`,
    scoreInputs: [
      { key: "anomalies_detected", value: anomalyCount, weight: 0.5 },
      { key: "event_types_analyzed", value: data.event_types_analyzed, weight: 0.5 },
    ],
    observations: obs,
    actions: anomalyCount > 5 ? ["Investigate the top anomaly. Spikes often indicate a runaway loop; drops indicate a broken pipeline."] : ["Monitor monthly. Significant anomalies will surface as they happen."],
  };
}

function dataQualityEngine(data: DataQualityData | null): IntelReport {
  if (!data) {
    return { score: 0, state: "insufficient_data", headline: "Loading…", scoreInputs: [], observations: [], actions: [] };
  }
  const orphans = Number(data.orphan_jobs || 0);
  const unprocessed = Number(data.unprocessed_forms || 0);
  const unattributed = Number(data.unattributed_contacts || 0);
  const stuck = Number(data.stuck_platform_events || 0);
  const totalIssues = orphans + unprocessed + unattributed + stuck;
  const score = Math.round(clamp(100 - totalIssues * 2));
  const obs = [
    `Cross-platform data integrity check: ${orphans} orphan jobs · ${unprocessed} unprocessed forms · ${unattributed} unattributed contacts · ${stuck} stuck events.`,
  ];
  if (orphans > 0) obs.push(`${orphans} OLIVER jobs have no linked contact_id — revenue not attributable to a customer. Investigate the job-creation flow.`);
  if (unprocessed > 0) obs.push(`${unprocessed} ARION form submissions older than 24h are still unprocessed — the form-to-contact pipeline is broken or backed up.`);
  if (unattributed > 0) obs.push(`${unattributed} SPARK contacts have no source attribution. Backfill where possible; require UTM on every form going forward.`);
  if (stuck > 0) obs.push(`${stuck} platform events stuck pending > 1 hour. The processor function may be erroring or paused.`);
  if (totalIssues === 0) obs.push(`All cross-platform integrity checks passing.`);
  const actions: string[] = [];
  if (unprocessed > 0) actions.push("Inspect arion.site_form_submission WHERE processed=0. Resubmit or fix the webhook pipeline.");
  if (unattributed > 0) actions.push("Add a hidden source field to every form. Backfill known sources on existing contacts via SQL.");
  if (stuck > 0) actions.push("Check Azure Function App logs for arion-event-processor. Re-deploy if the timer isn't firing.");
  return {
    score,
    state: "ok",
    headline: totalIssues === 0 ? "All integrity checks pass" : `${totalIssues} data-quality issues`,
    scoreInputs: [
      { key: "orphan_jobs", value: orphans, weight: 0.25 },
      { key: "unprocessed_forms", value: unprocessed, weight: 0.25 },
      { key: "unattributed_contacts", value: unattributed, weight: 0.25 },
      { key: "stuck_events", value: stuck, weight: 0.25 },
    ],
    observations: obs,
    actions,
  };
}

const ARGUS_INTEL = [
  { key: "connectivity_health", label: "Platform Connectivity Health", question: "How well are all active platforms talking to each other?", icon: Network, minTier: "pro" as const, engineKey: "connectivity" },
  { key: "automation_roi", label: "Automation ROI", question: "Which automations save the most time and which run without measurable impact?", icon: DollarSign, minTier: "business" as const, engineKey: "shell" },
  { key: "anomaly_detection", label: "Event Volume Anomaly Detection", question: "Are unusual spikes or drops in platform event volume signalling a problem?", icon: AlertCircle, minTier: "pro" as const, engineKey: "anomaly" },
  { key: "data_quality", label: "Cross-Platform Data Quality", question: "Is the data flowing between platforms clean, complete, and consistent?", icon: ShieldCheck, minTier: "business" as const, engineKey: "quality" },
  { key: "workflow_opt", label: "Workflow Optimisation", question: "Where are automation coverage gaps that are costing time or revenue?", icon: GitMerge, minTier: "business" as const, engineKey: "shell" },
];

function stateColor(s: IntelReport["state"]) { return s === "ok" ? "#16A34A" : s === "partial" ? "#EAB308" : "#94A3B8"; }
function stateLabel(s: IntelReport["state"]) { return s === "ok" ? "Live" : s === "partial" ? "Partial" : s === "insufficient_data" ? "Collecting data" : "Tier locked"; }
function stateBg(s: IntelReport["state"]) { return s === "ok" ? "border-emerald-200 bg-white" : s === "partial" ? "border-amber-200 bg-amber-50/30" : "border-slate-200 bg-slate-50"; }

export function ArgusIntelligencePage() {
  const { activeTenantId } = useAppState();
  const { getToken } = useAccessToken();
  const [connectivity, setConnectivity] = useState<ConnectivityHealthData | null>(null);
  const [anomaly, setAnomaly] = useState<AnomalyData | null>(null);
  const [quality, setQuality] = useState<DataQualityData | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const base = (import.meta.env.VITE_PLATFORM_API_BASE_URL as string)?.replace(/\/$/, "");
        if (!base) return;
        const headers: HeadersInit = { Authorization: `Bearer ${token.accessToken}`, "x-tenant-key": activeTenantId };
        const [c, a, q] = await Promise.all([
          globalThis.fetch(`${base}/argus/connectivity-health?days=30`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          globalThis.fetch(`${base}/argus/event-anomaly?days=60`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
          globalThis.fetch(`${base}/argus/data-quality`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        if (cancelled) return;
        setConnectivity(c?.data || null);
        setAnomaly(a?.data || null);
        setQuality(q?.data || null);
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [activeTenantId, getToken]);

  const reports = useMemo(() => {
    return {
      connectivity_health: connectivityHealthEngine(connectivity),
      automation_roi: { score: 0, state: "insufficient_data" as const, headline: "Requires 90+ days history + 50 executions", scoreInputs: [], observations: ["Automation ROI requires per-automation downstream-event chains over 90+ days. Engine pending Level 2 ARGUS work."], actions: [], dataGap: "v2 — needs workflow_run_log table." },
      anomaly_detection: eventAnomalyEngine(anomaly),
      data_quality: dataQualityEngine(quality),
      workflow_opt: { score: 0, state: "insufficient_data" as const, headline: "Requires workflow_registry table", scoreInputs: [], observations: ["Gap analysis requires a registry of expected workflows to compare against. Table doesn't exist yet."], actions: [], dataGap: "v2 — needs argus.workflow_registry table." },
    } as Record<string, IntelReport>;
  }, [connectivity, anomaly, quality]);

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Modelled patterns + optimisation opportunities across the platform event layer. 3 of 5 reports live today; 2 require Level 2 ARGUS tables.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>3 reports live from argus.platform_events:</strong> Platform Connectivity Health · Event Volume Anomaly Detection · Cross-Platform Data Quality. The remaining 2 reports (Automation ROI, Workflow Optimisation) require Level 2 ARGUS tables (workflow_run_log, workflow_registry) that don't exist yet.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {ARGUS_INTEL.map((m) => {
          const r = reports[m.key];
          const Icon = m.icon;
          const color = stateColor(r.state);
          const bg = stateBg(r.state);
          return (
            <button key={m.key} onClick={() => setOpen(m.key)} className={`text-left rounded-lg border-2 p-4 transition-shadow hover:shadow-md ${bg}`}>
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{m.label}</span>
                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${m.minTier === "business" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>{m.minTier}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{m.question}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 mb-2">
                <div className="flex items-center gap-2">
                  {r.state === "ok" || r.state === "partial" ? (
                    <span className="text-3xl font-bold tabular-nums" style={{ color }}>{r.score}</span>
                  ) : (
                    <span className="text-2xl font-bold text-slate-300">—</span>
                  )}
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}1A`, color }}>
                    {r.state === "ok" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                    {r.state === "partial" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    {(r.state === "insufficient_data" || r.state === "locked") && <Lock className="h-3 w-3" />}
                    {stateLabel(r.state)}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-xs text-slate-700 leading-snug line-clamp-2">{r.headline}</p>
              {r.dataGap && <div className="mt-2 text-[10px] text-amber-800 italic">→ {r.dataGap}</div>}
            </button>
          );
        })}
      </div>

      {open && (() => {
        const m = ARGUS_INTEL.find(x => x.key === open);
        if (!m) return null;
        const r = reports[open];
        return <ArgusIntelModal meta={m} report={r} onClose={() => setOpen(null)} />;
      })()}
    </div>
  );
}

function ArgusIntelModal({ meta, report, onClose }: { meta: any; report: IntelReport; onClose: () => void }) {
  const Icon = meta.icon;
  const color = stateColor(report.state);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: `${color}1A`, color }}><Icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">{meta.label}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{meta.question}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              {report.state === "ok" || report.state === "partial" ? (<div className="text-2xl font-bold tabular-nums" style={{ color }}>{report.score}</div>) : (<div className="text-xl text-slate-300">—</div>)}
              <div className="text-[9px] uppercase text-slate-400">{stateLabel(report.state)}</div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded text-slate-500"><X className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {report.dataGap && (<div className="rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3"><div className="text-xs font-semibold uppercase text-amber-800 tracking-wide mb-1">Data gap</div><p className="text-sm text-slate-800">{report.dataGap}</p></div>)}
          {report.scoreInputs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {report.scoreInputs.filter(i => i.value !== null).slice(0, 4).map(k => (
                <div key={k.key} className="rounded-md border border-slate-200 bg-white px-3 py-2" style={{ borderTopWidth: 3, borderTopColor: color }}>
                  <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide">{k.key.replace(/_/g, " ")}</div>
                  <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{String(k.value)}</div>
                </div>
              ))}
            </div>
          )}
          {report.observations.length > 0 && (
            <div className="rounded-lg bg-slate-900 text-slate-100 p-5">
              <div className="flex items-center gap-2 mb-3"><span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: "#84CC1620", color: "#A3E635" }}>ARGUS</span><span className="text-sm">Intelligence · {meta.label}</span></div>
              <ol className="space-y-3">
                {report.observations.map((obs, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs leading-relaxed text-slate-200">
                    <span className="flex-shrink-0 mt-0.5 h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ background: "#EA580C", color: "white" }}>{i + 1}</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ol>
              {report.actions.length > 0 && (
                <div className="border-t border-slate-700 mt-4 pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: "#A3E635" }}>Recommended actions</div>
                  <ul className="space-y-2">
                    {report.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-slate-200">
                        <span className="flex-shrink-0 mt-1 h-1.5 w-1.5 rounded-full" style={{ background: "#EA580C" }} />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">Generated by <span className="font-semibold" style={{ color: "#A3E635" }}>ARGUS</span></div>
          <button onClick={onClose} className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800">Close</button>
        </div>
      </div>
    </div>
  );
}

export default ArgusIntelligencePage;
