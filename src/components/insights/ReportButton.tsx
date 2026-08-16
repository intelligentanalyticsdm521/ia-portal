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
// Renders NOTHING when the report has no data. Brandon's call: a dead button on
// a client's screen is worse than no button.
import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { IadmModal } from "../IadmModal";
import { DeepReportView } from "./DeepReportView";
import { deriveDeepReport } from "../../analytics/deepReport";
import { deepConfigFor } from "../../analytics/deepConfigs";
import type { DetailPayload } from "../../analytics/detail";

export function ReportButton({
  detail, reportId, label = "See full details", subtitle, product = "arion",
}: {
  /** The `detail` map from the ARION insights payload. */
  detail: DetailPayload | undefined;
  /** DetailReport id, e.g. "component_upkeep". */
  reportId: string;
  label?: string;
  /** Overrides the modal subtitle; defaults to the item count. */
  subtitle?: string;
  /** Which product's branding the modal wears. Was hardcoded to "arion", so
   *  every SPARK and OLIVER report opened under another product's badge. */
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
}) {
  const [open, setOpen] = useState(false);
  const report = detail?.[reportId];

  // Derive once per open, not per render — the engine walks every item's series.
  const deep = useMemo(
    () => (report && open ? deriveDeepReport(report, deepConfigFor(report.id)) : null),
    [report, open],
  );

  // No data → no button. Never a disabled control promising a future release.
  if (!report || !report.items?.length) return null;

  const count = report.items.length;
  const itemWord = count === 1 ? report.itemLabel : `${report.itemLabel}s`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-[#2D9CDB] hover:text-[#2D9CDB]"
      >
        <BarChart3 className="h-3.5 w-3.5" />
        {label}
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
          {count}
        </span>
      </button>

      {open && deep && (
        <IadmModal
          open
          onClose={() => setOpen(false)}
          product={product}
          title={report.label}
          subtitle={subtitle || `${count} ${itemWord.toLowerCase()} · full report`}
          size="xl"
        >
          <div className="max-h-[78vh] overflow-y-auto px-1 pb-2">
            <DeepReportView deep={deep} />
          </div>
        </IadmModal>
      )}
    </>
  );
}

export default ReportButton;
