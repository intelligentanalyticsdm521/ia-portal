// ReportsHubPage — the IA Insights "Reports" bucket (Brandon 2026-07-26):
// general/operational reporting lives HERE, not as stray nav groups on each
// platform. Trends answers "how am I doing", Intelligence answers "what's
// coming", Reports is the plain operational record.
import { useNavigate } from "react-router-dom";
import { ChevronRight, BarChart2 } from "lucide-react";

interface ReportLink { label: string; description: string; route: string; }

const HUB: Record<string, { blurb: string; links: ReportLink[] }> = {
  SPARK: {
    blurb: "Operational reports for your CRM and email — the plain record behind the scored Trends and Intelligence views.",
    links: [
      { label: "Real-Time Activity", description: "Sends, opens, clicks, and contact activity as they happen.", route: "/app/services/spark_realtime_metrics" },
      { label: "Usage", description: "Plan usage — contacts, sends, and automation runs against your limits.", route: "/app/services/spark_usage_report" },
      { label: "Audit Log", description: "Who did what, when — every change in your SPARK workspace.", route: "/app/services/spark_audit_log" },
    ],
  },
  OLIVER: {
    blurb: "Operational reports for your field operations — the plain record behind the scored Trends and Intelligence views.",
    links: [
      { label: "Activity Log", description: "Every action across jobs, quotes, invoices, and customers.", route: "/app/services/oliver_activity_log" },
    ],
  },
};

export function ReportsHubPage({ platform }: { platform: "SPARK" | "OLIVER" }) {
  const navigate = useNavigate();
  const hub = HUB[platform];
  return (
    <div className="p-1">
      <div className="insights-shell mb-4">
        <h1 className="text-lg font-bold text-slate-900">{platform} Insights — Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">{hub.blurb}</p>
      </div>
      <div className="insights-shell">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {hub.links.map((l) => (
            <button key={l.route} onClick={() => navigate(l.route)}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left hover:border-slate-300 hover:shadow-sm">
              <BarChart2 className="h-5 w-5 text-slate-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900">{l.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{l.description}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-1" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ReportsHubPage;
