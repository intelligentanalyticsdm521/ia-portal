// ArgusTrendsPage — v9.0 ARGUS Trends section.
//
// Spec §6.2: 4 reports on automation health and platform event flow.
// Automation Health + Event Flow can populate from platform_events at
// launch. Workflow Performance + Cross-Product Trigger Chains require
// Level 2 ARGUS tables (workflow_registry, workflow_run_log) which are
// 30-60 days post-launch.
import { Activity, GitBranch, Network, AlertCircle } from "lucide-react";

interface TrendReport {
  key: string;
  label: string;
  question: string;
  icon: typeof Activity;
  source: string;
  status: "live" | "shell";
  june1Note: string;
}

const ARGUS_TRENDS: TrendReport[] = [
  {
    key: "automation_health",
    label: "Automation Health",
    question: "Are my automations running reliably?",
    icon: Activity,
    source: "argus.platform_events (status, error_detail, processed_at, event_type)",
    status: "live",
    june1Note: "Live with platform_events data",
  },
  {
    key: "event_flow",
    label: "Event Flow",
    question: "How many platform events are flowing and where are they going?",
    icon: Network,
    source: "argus.platform_events (event_type, source_product, volume by period)",
    status: "live",
    june1Note: "Live with platform_events data",
  },
  {
    key: "workflow_perf",
    label: "Workflow Performance",
    question: "Which workflows succeed, fail, and take longest?",
    icon: GitBranch,
    source: "argus.workflow_run_log (Level 2 — post-launch table)",
    status: "shell",
    june1Note: "Shell — requires Level 2 argus.workflow_run_log table",
  },
  {
    key: "trigger_chains",
    label: "Cross-Product Trigger Chains",
    question: "Which multi-platform automation chains are healthy?",
    icon: AlertCircle,
    source: "platform_events joined on source/destination product + event type sequences",
    status: "shell",
    june1Note: "Shell — requires Level 2 workflow_registry table",
  },
];

export function ArgusTrendsPage() {
  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Trends</h1>
        <p className="text-sm text-slate-500 mt-0.5">Operational reports on automation health + platform event flow.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-blue-400 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>June 1 status:</strong> Automation Health + Event Flow are live with argus.platform_events data.
        Workflow Performance + Cross-Product Trigger Chains require Level 2 ARGUS tables (workflow_registry,
        workflow_run_log) which are slated for 30-60 days post-launch.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {ARGUS_TRENDS.map((r) => (
          <div key={r.key} className={`rounded-lg border p-4 ${r.status === "live" ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start gap-2 mb-2">
              <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: r.status === "live" ? "#84CC1620" : "#94A3B820", color: r.status === "live" ? "#A3E635" : "#94A3B8" }}>
                <r.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm text-slate-900">{r.label}</h3>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${r.status === "live" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                    {r.status === "live" ? "Live" : "Shell"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{r.question}</p>
              </div>
            </div>
            <div className="text-[10px] text-slate-600 italic mb-2 font-mono break-all">{r.source}</div>
            <div className={`rounded px-2 py-1.5 text-[10px] ${r.status === "live" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
              {r.june1Note}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArgusTrendsPage;
