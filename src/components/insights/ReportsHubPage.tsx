// ReportsHubPage — the IA Insights "Reports" bucket (Brandon 2026-07-26):
// general/operational reporting lives HERE, not as stray nav groups on each
// platform. Trends answers "how am I doing", Intelligence answers "what's
// coming", Reports is the plain operational record.
import { useNavigate } from "react-router-dom";
import { ChevronRight, BarChart2 } from "lucide-react";

/**
 * One entry in the operational-records section. Either a page (`route`) or
 * something the host page opens itself (`action`, handed to `onAction`) —
 * STELLA's Accountant pack is a download bundle that opens over the Reports
 * page rather than a page of its own (D-177).
 */
interface ReportLink { label: string; description: string; route?: string; action?: string; }

type Platform = "SPARK" | "OLIVER" | "STELLA";

const DEFAULT_BARE_BLURB =
  "The plain record behind the analysis above — activity as it happens, usage against your limits, and who changed what.";

const HUB: Record<Platform, { blurb: string; bareBlurb?: string; links: ReportLink[] }> = {
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
  // D-177: STELLA's statements are the report catalog above; these are the
  // records and tools around them. Accountant pack stays one click away — it
  // used to be the tenth tab of the old Reports page.
  STELLA: {
    blurb: "Your own reports, the schedules that send them, your downloads, and the pack your accountant asks for.",
    bareBlurb: "Your own reports and the files around your statements — build a report, schedule one, find a download, or put together the pack your accountant asks for.",
    links: [
      { label: "Report Library", description: "Every report you or your team saved, ready to run again.", route: "/app/services/stella_report_library" },
      { label: "Report Builder", description: "Build your own report from your books — pick the columns, filters and totals.", route: "/app/services/stella_report_builder" },
      { label: "Scheduled Reports", description: "Reports that email themselves to you or your accountant on a schedule.", route: "/app/services/stella_report_scheduled" },
      { label: "Exports", description: "Every file you have downloaded from your books, and when.", route: "/app/services/stella_report_exports" },
      { label: "Accountant pack", description: "General ledger, trial balance and every transaction for a year — one workbook for your accountant.", action: "accountant_pack" },
    ],
  },
};

export function ReportsHubPage({ platform, bare = false, onAction }: {
  platform: Platform;
  bare?: boolean;
  /** Called with a link's `action` (links that open something on the host page). */
  onAction?: (action: string) => void;
}) {
  const navigate = useNavigate();
  const hub = HUB[platform];
  const open = (l: ReportLink) => {
    if (l.action) onAction?.(l.action);
    else if (l.route) navigate(l.route);
  };

  // `bare` drops the page chrome so this can sit INSIDE the reports catalog as
  // one more section. Stacking the full page under the catalog gave the client
  // two competing "Reports" headings on one screen.
  if (bare) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-slate-900">Operational records</h2>
          <p className="text-[11px] text-slate-500">{hub.bareBlurb || DEFAULT_BARE_BLURB}</p>
        </div>
        <div className="grid grid-cols-1 gap-2 p-3 md:grid-cols-2">
          {hub.links.map((l) => (
            <button key={l.route || l.action} type="button" onClick={() => open(l)}
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
            <button key={l.route || l.action} type="button" onClick={() => open(l)}
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
