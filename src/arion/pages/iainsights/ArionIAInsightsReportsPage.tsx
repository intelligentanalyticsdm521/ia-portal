// ARION → IA Insights → Reports (2026-08-14).
//
// Brandon: "all the reports should also live in the ARION>IA Insights>Reports."
//
// The catalog — every report we produce, grouped by the feature it belongs to,
// each stating the question it answers. It is the third door into the SAME
// report definition; the other two are the operational page's "See full
// details" button and the Trends / Intelligence drill-down. All three render
// `DeepReportView` off `deriveDeepReport`, so a report cannot say different
// things depending on how you reached it.
//
// This page never invents a report. It reads whatever `detail` the insights
// payload carries, so a report appears here the moment its data does — and a
// report with no data yet is shown as "collecting", not hidden and not faked.
import { useMemo } from "react";
import { FileBarChart, Clock } from "lucide-react";
import { useArionInsightsPayload } from "../../../hooks/useArionInsightsPayload";
import { ReportButton } from "../../../components/insights/ReportButton";
import { ARION_DASHBOARDS } from "../../../analytics/arionDashboards";

/** Feature grouping for the catalog — dashboard key → the nav feature a client
 *  recognises. Reports carry `section` as "dashboardKey.sectionKey". */
const FEATURE_LABEL: Record<string, string> = {
  technical: "Website & Site Health",
  search_visibility: "Search Visibility",
  local_presence: "Business Profile",
  audience_conversion: "Analytics",
  content: "Content",
  social_presence: "Social",
};

/** What each report answers, in the owner's words. Keyed by report id.
 *  A report with no entry still lists — it just shows its own label. */
const ANSWERS: Record<string, string> = {
  component_upkeep: "Is anyone actually looking after this site?",
  content_library: "Page by page — what is thin, stale, or competing with itself?",
  page_reachability: "Which pages can nobody actually find?",
  media_library: "What is my media library doing to my speed?",
  keyword_movement: "Which keywords moved, and which ones matter?",
  striking_distance: "What is one push from page one?",
  query_performance: "What are people searching to find me?",
  ctr_by_query: "Where am I being seen but not clicked?",
  page_search_performance: "Which pages earn my search traffic?",
  top_pages: "What content actually gets read?",
  channel_breakdown: "Where does my traffic come from?",
  geography: "Where are my visitors?",
  conversion_by_source: "Which channels turn into enquiries?",
  gbp_search_keywords: "What did people type to find my listing?",
  referring_domains: "Who links to me?",
};

export function ArionIAInsightsReportsPage() {
  const payload = useArionInsightsPayload();
  const detail = payload?.detail;

  const groups = useMemo(() => {
    const byFeature = new Map<string, Array<{ id: string; label: string; count: number; itemLabel: string }>>();
    for (const rep of Object.values(detail || {})) {
      const dashKey = String(rep.section || "").split(".")[0];
      const feature = FEATURE_LABEL[dashKey] || "Other";
      if (!byFeature.has(feature)) byFeature.set(feature, []);
      byFeature.get(feature)!.push({
        id: rep.id, label: rep.label, count: rep.items?.length || 0, itemLabel: rep.itemLabel,
      });
    }
    // Feature order follows the dashboards, so the catalog reads like the nav.
    const order = ARION_DASHBOARDS.map((d) => FEATURE_LABEL[d.key]).filter(Boolean);
    return [...byFeature.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([feature, reports]) => ({ feature, reports: reports.sort((x, y) => x.label.localeCompare(y.label)) }));
  }, [detail]);

  const total = groups.reduce((s, g) => s + g.reports.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every report we produce for this site, grouped by the part of your presence it covers.
          Each one is the full analysis — the same report you reach from the page itself or by
          drilling into a score.
        </p>
      </div>

      {!payload && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Loading your reports…
        </div>
      )}

      {payload && total === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4" /> Still collecting data
          </div>
          <p className="mt-1 text-[13px]">
            Reports appear here as soon as there is something real to say. Nothing is hidden — there
            is simply no history for this site yet.
          </p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.feature} className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">{g.feature}</h2>
            <p className="text-[11px] text-slate-500">
              {g.reports.length} report{g.reports.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {g.reports.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileBarChart className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <span className="truncate text-xs font-semibold text-slate-800">{r.label}</span>
                  </div>
                  <p className="mt-0.5 pl-5 text-[11px] text-slate-500">
                    {ANSWERS[r.id] || `${r.count} ${r.itemLabel.toLowerCase()}${r.count === 1 ? "" : "s"} tracked`}
                  </p>
                </div>
                <ReportButton detail={detail} reportId={r.id} label="Open report" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default ArionIAInsightsReportsPage;
