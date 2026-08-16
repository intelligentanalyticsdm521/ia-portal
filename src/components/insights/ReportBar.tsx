// ReportBar — the reports that belong to THIS Feature > Function page.
//
// Brandon, 2026-08-14: "I need these accessible like we said from the
// feature/function the report is covering."
//
// ReportButton renders one report. Most pages have several: Search Performance
// covers queries, pages, devices, countries, CTR and page+query pairs, and a
// single "See full details" button cannot say which of those it opens. This
// renders one named button per report instead, so the page shows exactly what
// analysis exists for the thing you are looking at.
//
// Reports with no data render nothing — same rule as ReportButton. If none of
// the page's reports have data the whole bar disappears rather than leaving a
// heading over an empty row.
import { ReportButton } from "./ReportButton";
import type { DetailPayload } from "../../analytics/detail";

export interface ReportBarItem {
  /** DetailReport id, e.g. "query_performance". */
  id: string;
  /** Short button label — the report's own title is on the modal. */
  label: string;
}

export function ReportBar({
  detail, reports, heading = "Full reports", product = "arion",
}: {
  detail: DetailPayload | undefined;
  reports: ReportBarItem[];
  heading?: string;
  /** Product branding for the modal these buttons open. */
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
}) {
  const live = reports.filter((r) => (detail?.[r.id]?.items?.length ?? 0) > 0);
  if (!live.length) return null;

  return (
    <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2.5">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {heading}
      </div>
      <div className="flex flex-wrap gap-2">
        {live.map((r) => (
          <ReportButton key={r.id} detail={detail} reportId={r.id} label={r.label} product={product} />
        ))}
      </div>
    </div>
  );
}

export default ReportBar;
