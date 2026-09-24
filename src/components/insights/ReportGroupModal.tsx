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
import { useMemo, useState, type ReactNode } from "react";
import { IadmModal } from "../IadmModal";
import { DeepReportView } from "./DeepReportView";
import { deriveDeepReport } from "../../analytics/deepReport";
import { deepConfigFor } from "../../analytics/deepConfigs";
import type { ReportGroup } from "../../analytics/reportGroups";
import type { DetailReport } from "../../analytics/detail";

/**
 * What the modal header carries on its right, beside the close X. Either one
 * node for every tab, or a function of the report on screen — STELLA passes
 * Export (CSV / Excel / PDF) + Print pointed at THAT statement's endpoint, so
 * switching tab switches what gets exported (D-177). Products that pass
 * nothing render exactly as before.
 */
export type ReportActions = ReactNode | ((report: DetailReport) => ReactNode);

export function ReportGroupModal({
  group, initialTab = 0, product = "arion", onClose, actions,
}: {
  group: ReportGroup;
  /** Which report to land on — the one the button that opened this named. */
  initialTab?: number;
  product?: "arion" | "spark" | "oliver" | "argus" | "stella";
  onClose: () => void;
  /** Header actions for the report on screen. See ReportActions. */
  actions?: ReportActions;
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
  const headerActions = typeof actions === "function" ? actions(active) : actions;
  const hasActions = headerActions != null && headerActions !== false;
  const title = multi ? group.label : active.label;
  const subtitle = multi
    ? `${active.label} · ${count} ${itemWord.toLowerCase()}`
    : `${count} ${itemWord.toLowerCase()} · full report`;

  return (
    <IadmModal
      open
      onClose={onClose}
      product={product}
      // The group names the door; the tab names what you are looking at. On a
      // single-report group there is no tab strip, so the title carries it.
      title={title}
      subtitle={subtitle}
      size="report"
      headerActions={!hasActions ? undefined : (
        <div data-report-actions className="flex items-center gap-2">{headerActions}</div>
      )}
    >
      {/* With actions (STELLA's Export/Print), the body is marked as the print
          root: Print prints THIS — the report on screen — and nothing behind
          the modal, under a print-only heading carrying the title the ink
          header would have. Without actions nothing here changes. */}
      <div className="px-4 py-4 sm:px-5" data-report-print-root={hasActions ? "" : undefined}>
        {hasActions && (
          <div className="mb-3 hidden print:block">
            <div className="text-base font-bold text-slate-900">{multi ? `${group.label} — ${active.label}` : active.label}</div>
            <div className="text-[11px] text-slate-500">{subtitle}</div>
          </div>
        )}
        {multi && (
          // Scrolls rather than wraps: a six-tab group on a phone should not
          // push the report itself below the fold.
          <div
            role="tablist"
            aria-label={`${group.label} reports`}
            className="-mx-4 mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:-mx-5 sm:px-5 print:hidden"
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
