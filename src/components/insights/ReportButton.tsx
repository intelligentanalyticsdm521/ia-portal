// ReportButton — "See full details" on any operational page (2026-08-14).
//
// Brandon: "for each navigation section Feature>Function we need to have the
// report as a button... that brings up our extra large report modal. Then all
// the reports should also live in the ARION>IA Insights>Reports."
//
// ONE report definition, THREE doors into it:
//   1. the operational page  — this button; the page is the high-level view,
//      the modal is the depth ("Core Web Vitals is already the high level view,
//      then see full details is exactly right")
//   2. IA Insights → Trends / Intelligence — drill dashboard → section → report
//   3. IA Insights → Reports — the catalog of everything
//
// All three render the SAME `DeepReportView` from the SAME `deriveDeepReport`,
// so a report can never say different things in different places. That is the
// whole reason this is a shared component and not a per-page panel.
//
// 2026-08-16 — the button now opens the report's GROUP, focused on the tab for
// the report it names. Sibling reports come along, so someone who opened
// "Traffic by Channel" from the page can reach Medium and Referral Sources
// without going back out to the catalog. Every call site is untouched: the
// props are the same, only what opens changed.
//
// Renders NOTHING when the report has no data. Brandon's call: a dead button on
// a client's screen is worse than no button.
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { ReportGroupModal } from "./ReportGroupModal";
import { buildReportGroups, findGroupFor } from "../../analytics/reportGroups";
import { ARION_DASHBOARDS } from "../../analytics/arionDashboards";
import { SPARK_DASHBOARDS } from "../../analytics/sparkDashboards";
import { OLIVER_DASHBOARDS } from "../../analytics/oliverDashboards";
import { ARGUS_DASHBOARDS } from "../../analytics/argusDashboards";
import type { DetailPayload } from "../../analytics/detail";
import type { DashboardDef } from "../../analytics/catalog";

const DASHBOARDS: Record<string, DashboardDef[]> = {
  arion: ARION_DASHBOARDS,
  spark: SPARK_DASHBOARDS,
  oliver: OLIVER_DASHBOARDS,
  argus: ARGUS_DASHBOARDS,
  stella: [],
};

export function ReportButton({
  detail, reportId, label = "See full details", subtitle, product = "arion",
}: {
  /** The `detail` map from the product's insights payload. */
  detail: DetailPayload | undefined;
  /** DetailReport id, e.g. "component_upkeep". */
  reportId: string;
  label?: string;
  /** Kept for call-site compatibility; the group modal derives its own. */
  subtitle?: string;
  /** Which product's branding the modal wears. Was hardcoded to "arion", so
   *  every SPARK and OLIVER report opened under another product's badge. */
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
}) {
  const [open, setOpen] = useState(false);
  const report = detail?.[reportId];

  // Grouping is cheap — it reads section strings, it does not derive reports —
  // so it can run per render. The expensive derivation stays inside the modal
  // and only for the visible tab.
  const found = useMemo(() => {
    if (!report?.items?.length) return null;
    return findGroupFor(buildReportGroups(detail, DASHBOARDS[product] || []), reportId);
  }, [detail, reportId, product, report]);

  // No data → no button. Never a disabled control promising a future release.
  if (!report || !report.items?.length || !found) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#2D9CDB] hover:text-[#2D9CDB]"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        {label}
      </button>

      {open && (
        <ReportGroupModal
          group={found.group}
          initialTab={found.tabIndex}
          product={product}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default ReportButton;
