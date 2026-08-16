// ReportGroupModal — one door, one tab per report.
//
// Brandon, 2026-08-16: "merge them into a Traffic report and then inside the
// report we have a tab or a page for each report... then when someone goes to
// the platform>feature>function page they can get to that [tab]."
//
// Each tab renders the SAME DeepReportView off the SAME deriveDeepReport as
// before — the grouping is presentation only, so a report cannot say different
// things depending on whether it was reached from a tab, a function page or a
// score drill-through.
//
// Only the visible tab is derived. The engine walks every item's full series,
// and deriving six reports to show one would make opening a group six times the
// work of opening a report.
import { useMemo, useState } from "react";
import { IadmModal } from "../IadmModal";
import { DeepReportView } from "./DeepReportView";
import { deriveDeepReport } from "../../analytics/deepReport";
import { deepConfigFor } from "../../analytics/deepConfigs";
import type { ReportGroup } from "../../analytics/reportGroups";

export function ReportGroupModal({
  group, initialTab = 0, product = "arion", onClose,
}: {
  group: ReportGroup;
  /** Which report to land on — the one the button that opened this named. */
  initialTab?: number;
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
  onClose: () => void;
}) {
  const [tab, setTab] = useState(() =>
    initialTab >= 0 && initialTab < group.reports.length ? initialTab : 0);

  const active = group.reports[tab];
  const deep = useMemo(
    () => (active ? deriveDeepReport(active, deepConfigFor(active.id)) : null),
    [active],
  );
  if (!active || !deep) return null;

  const multi = group.reports.length > 1;
  const count = active.items.length;
  const itemWord = count === 1 ? active.itemLabel : `${active.itemLabel}s`;

  return (
    <IadmModal
      open
      onClose={onClose}
      product={product}
      // The group names the door; the tab names what you are looking at. On a
      // single-report group there is no tab strip, so the title carries it.
      title={multi ? group.label : active.label}
      subtitle={multi
        ? `${active.label} · ${count} ${itemWord.toLowerCase()}`
        : `${count} ${itemWord.toLowerCase()} · full report`}
      size="report"
    >
      <div className="px-4 py-4 sm:px-5">
        {multi && (
          // Scrolls rather than wraps: a six-tab group on a phone should not
          // push the report itself below the fold.
          <div
            role="tablist"
            aria-label={`${group.label} reports`}
            className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:-mx-5 sm:px-5"
          >
            {group.reports.map((r, i) => (
              <button
                key={r.id}
                role="tab"
                type="button"
                aria-selected={i === tab}
                onClick={() => setTab(i)}
                className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                  i === tab
                    ? "border-[#2D9CDB] text-[#2D9CDB]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
        <DeepReportView deep={deep} />
      </div>
    </IadmModal>
  );
}

export default ReportGroupModal;
