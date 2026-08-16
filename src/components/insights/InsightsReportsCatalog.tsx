// InsightsReportsCatalog — the "every report we produce" page, for any product.
//
// ARION had this and SPARK and OLIVER did not, which is why Brandon went
// looking for their reports on 2026-08-14 and found nothing: the reports were
// built and wired to their feature pages, but there was no catalog to browse
// them from. Extracted rather than copied a third time so the three products
// cannot drift apart again.
//
// The catalog is the third door into the SAME report definition; the other two
// are the operational page's button and the Trends / Intelligence drill-down.
// All three render `DeepReportView` off `deriveDeepReport`, so a report cannot
// say different things depending on how you reached it.
//
// This page never invents a report. It reads whatever `detail` the product's
// insights payload carries, so a report appears the moment its data does — and
// a product with no data yet says so rather than showing a fabricated list.
import { useMemo } from "react";
import { FileBarChart, Clock } from "lucide-react";
import { ReportButton } from "./ReportButton";
import type { DetailPayload } from "../../analytics/detail";

export interface CatalogDashboard {
  key: string;
  label: string;
}

export function InsightsReportsCatalog({
  detail,
  loading,
  dashboards,
  featureLabel,
  answers = {},
  intro,
}: {
  /** `detail` from the product's insights payload. */
  detail: DetailPayload | undefined;
  /** True while the payload is still being fetched. */
  loading: boolean;
  /** The product's dashboards, in nav order — drives grouping order. */
  dashboards: CatalogDashboard[];
  /** dashboard key → the feature name a client recognises. */
  featureLabel: Record<string, string>;
  /** report id → the question it answers, in the owner's words. */
  answers?: Record<string, string>;
  intro?: string;
}) {
  const groups = useMemo(() => {
    const byFeature = new Map<string, Array<{ id: string; label: string; count: number; itemLabel: string }>>();
    for (const rep of Object.values(detail || {})) {
      const dashKey = String(rep.section || "").split(".")[0];
      const feature = featureLabel[dashKey] || "Other";
      if (!byFeature.has(feature)) byFeature.set(feature, []);
      byFeature.get(feature)!.push({
        id: rep.id, label: rep.label, count: rep.items?.length || 0, itemLabel: rep.itemLabel,
      });
    }
    // Feature order follows the dashboards, so the catalog reads like the nav.
    const order = dashboards.map((d) => featureLabel[d.key]).filter(Boolean);
    return [...byFeature.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([feature, reports]) => ({ feature, reports: reports.sort((x, y) => x.label.localeCompare(y.label)) }));
  }, [detail, dashboards, featureLabel]);

  const total = groups.reduce((s, g) => s + g.reports.length, 0);

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-10">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          {intro ||
            "Every report we produce, grouped by the part of your business it covers. Each one is the full analysis — the same report you reach from the page itself or by drilling into a score."}
        </p>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
          Loading your reports…
        </div>
      )}

      {!loading && total === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-semibold">
            <Clock className="h-4 w-4" /> Still collecting data
          </div>
          <p className="mt-1 text-[13px]">
            Reports appear here as soon as there is something real to say. Nothing is hidden — there
            is simply no history yet.
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
                    {answers[r.id] || `${r.count} ${r.itemLabel.toLowerCase()}${r.count === 1 ? "" : "s"} tracked`}
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

export default InsightsReportsCatalog;
