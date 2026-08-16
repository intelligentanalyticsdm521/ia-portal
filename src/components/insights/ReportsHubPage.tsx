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

export function ReportsHubPage({ platform, bare = false }: { platform: "SPARK" | "OLIVER"; bare?: boolean }) {
  const navigate = useNavigate();
  const hub = HUB[platform];

  // `bare` drops the page chrome so this can sit INSIDE the reports catalog as
  // one more section. Stacking the full page under the catalog gave the client
  // two competing "Reports" headings on one screen.
  if (bare) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Operational records</h2>
          <p className="text-[11px] text-slate-500">
            The plain record behind the analysis above — activity as it happens, usage against your
            limits, and who changed what.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
          {hub.links.map((l) => (
            <button key={l.route} onClick={() => navigate(l.route)}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left hover:border-slate-300 hover:shadow-sm">
              <BarChart2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900">{l.label}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{l.description}</div>
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      </section>
    );
  }

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
