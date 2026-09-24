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
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { FileBarChart, BarChart3, Clock } from "lucide-react";
import { ReportGroupModal, type ReportActions } from "./ReportGroupModal";
import { buildReportGroups, type ReportGroup } from "../../analytics/reportGroups";
import type { DetailPayload } from "../../analytics/detail";
import { pluralize } from "../../analytics/detail";
import type { DashboardDef } from "../../analytics/catalog";

/** @deprecated The catalog now needs full definitions — use DashboardDef. */
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
  footer,
  product = "arion",
  controls,
  reportActions,
}: {
  /** `detail` from the product's insights payload. */
  detail: DetailPayload | undefined;
  /** True while the payload is still being fetched. */
  loading: boolean;
  /** The product's dashboards, in nav order — drives grouping order. */
  dashboards: DashboardDef[];
  /** dashboard key → the feature name a client recognises. */
  featureLabel: Record<string, string>;
  /** report id → the question it answers, in the owner's words. */
  answers?: Record<string, string>;
  intro?: string;
  /** Rendered INSIDE the page container, below the groups. Anything passed as a
   *  sibling instead escapes the max-w-5xl wrapper and runs the full width of
   *  the screen, which is what happened to the operational-records section. */
  footer?: ReactNode;
  /** Product branding for the report modals opened from this catalog. */
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
  /** Rendered under the intro, above the sections — one control that applies
   *  to every report (STELLA's month picker + cash/accrual toggle). */
  controls?: ReactNode;
  /** Passed to every report modal's header (see ReportGroupModal). */
  reportActions?: ReportActions;
}) {
  // Reports are grouped by the SECTION they already carry, then those sections
  // are bucketed by feature. Two levels, both of which already exist in the
  // data — the catalog now mirrors the nav rather than inventing an order.
  const features = useMemo(() => {
    const sectionGroups = buildReportGroups(detail, dashboards);
    const byFeature = new Map<string, ReportGroup[]>();
    for (const g of sectionGroups) {
      const feature = featureLabel[g.dashboardKey] || "Other";
      if (!byFeature.has(feature)) byFeature.set(feature, []);
      byFeature.get(feature)!.push(g);
    }
    const order = dashboards.map((d) => featureLabel[d.key]).filter(Boolean);
    return [...byFeature.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([feature, sections]) => ({ feature, sections }));
  }, [detail, dashboards, featureLabel]);

  const total = features.reduce((n, f) => n + f.sections.reduce((m, g) => m + g.reports.length, 0), 0);
  // Which group is open, and on which tab. One modal for the whole page.
  const [open, setOpen] = useState<{ group: ReportGroup; tab: number } | null>(null);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 pb-10">
      <div>
        <h1 className="text-lg font-bold text-slate-900">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          {intro ||
            "Every report we produce, grouped by the part of your business it covers. Each one is the full analysis — the same report you reach from the page itself or by drilling into a score."}
        </p>
      </div>

      {controls}

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

      {/* Sections tile across the width. Each is self-contained, so two or
          three abreast reads as a contact sheet of what exists rather than a
          long scroll — and it collapses back to one column on a phone. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3 lg:items-start">
      {features.map((f) => (
        <section key={f.feature} className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">{f.feature}</h2>
            <p className="text-[11px] text-slate-500">
              {f.sections.length} report{f.sections.length === 1 ? "" : "s"}
              {" · "}
              {f.sections.reduce((n, g) => n + g.reports.length, 0)} views
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {f.sections.map((g) => (
              <div key={g.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileBarChart className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                    <span className="truncate text-xs font-semibold text-slate-800">{g.label}</span>
                  </div>
                  {/* Naming the tabs is the point: the row has to say what is
                      inside it, or grouping just hides things one level down. */}
                  <p className="mt-0.5 pl-5 text-[11px] text-slate-500">
                    {g.reports.length === 1
                      ? (answers[g.reports[0].id]
                          || `${g.reports[0].items.length} ${pluralize(g.reports[0].itemLabel, g.reports[0].items.length)} tracked`)
                      : g.reports.map((r) => r.label).join(" · ")}
                  </p>
                </div>
                <div className="flex-shrink-0 pl-5 sm:pl-0">
                  <button
                    type="button"
                    onClick={() => setOpen({ group: g, tab: 0 })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#2D9CDB] hover:text-[#2D9CDB]"
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Open report
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>

      {open && (
        <ReportGroupModal
          group={open.group}
          initialTab={open.tab}
          product={product}
          onClose={() => setOpen(null)}
          actions={reportActions}
        />
      )}

      {footer}
    </div>
  );
}

export default InsightsReportsCatalog;
