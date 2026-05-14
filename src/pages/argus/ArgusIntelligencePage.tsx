// ArgusIntelligencePage — v9.0 ARGUS Intelligence section.
//
// Spec §6.3: 5 reports looking for patterns + optimisation opportunities
// across the platform event layer. All v2 — deferred until sufficient
// automation history exists (90 days minimum).
import { Lock, Network, DollarSign, AlertCircle, ShieldCheck, GitMerge } from "lucide-react";

interface IntelReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Network;
  modelType: string;
  minTier: "pro" | "business";
  dataGate: string;
}

const ARGUS_INTEL: IntelReport[] = [
  {
    key: "connectivity_health",
    label: "Platform Connectivity Health",
    question: "How well are all active platforms talking to each other?",
    icon: Network,
    modelType: "Per-product-pair: event volume, success rate, processing latency, failed event rate",
    minTier: "pro",
    dataGate: "Min 90 days of platform_events history",
  },
  {
    key: "automation_roi",
    label: "Automation ROI",
    question: "Which automations save the most time and which run without measurable impact?",
    icon: DollarSign,
    modelType: "Per-automation: execution count × downstream-event success rate × outcome-rate × estimated time-saved",
    minTier: "business",
    dataGate: "90 days history · min 50 executions",
  },
  {
    key: "anomaly_detection",
    label: "Event Volume Anomaly Detection",
    question: "Are unusual spikes or drops in platform event volume signalling a problem?",
    icon: AlertCircle,
    modelType: "Z-score anomaly detection on daily event volume per event_type — flags >2σ deviations",
    minTier: "pro",
    dataGate: "Min 60 days of platform_events for baseline",
  },
  {
    key: "data_quality",
    label: "Cross-Platform Data Quality",
    question: "Is the data flowing between platforms clean, complete, and consistent?",
    icon: ShieldCheck,
    modelType: "Orphaned records + unprocessed events + missing-attribution + duplicate detection",
    minTier: "business",
    dataGate: "All active platforms with min 30 days cross-product data flow",
  },
  {
    key: "workflow_opt",
    label: "Workflow Optimisation",
    question: "Where are automation coverage gaps that are costing time or revenue?",
    icon: GitMerge,
    modelType: "Gap analysis: platform events with no registered automation handler · cross-referenced with common patterns",
    minTier: "business",
    dataGate: "Requires Level 2 argus.workflow_registry table",
  },
];

export function ArgusIntelligencePage() {
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Modelled patterns + optimisation opportunities across the platform event layer.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>v2 — all reports are shells at launch.</strong> Two things have to happen before any of
        these go live: (1) the rendering engine for the report has to be built (post-launch work), and
        (2) the underlying data must accumulate to the gate (typically 90+ days of platform_events history).
        Each card's "Data gate" row lists the specific threshold. Reports do <em>not</em> auto-populate
        from data alone — the engine has to ship first.
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {ARGUS_INTEL.map((r) => (
          <div key={r.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center bg-slate-200 text-slate-500">
                <r.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                  <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${r.minTier === "business" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700"}`}>
                    {r.minTier}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.question}</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 italic mb-2">Model: {r.modelType}</div>
            <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1.5">
              <Lock className="h-3 w-3 flex-shrink-0" />
              <span><strong>Data gate:</strong> {r.dataGate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArgusIntelligencePage;
