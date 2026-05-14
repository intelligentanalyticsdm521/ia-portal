// ArionReportDetailModal — v7.5 restoration of the rich legacy report
// modal content for the new IA Insights Trends grid.
//
// Wraps the legacy renderModalContent() + ArgusInsightBox renderers
// (which already encode all the data-driven per-report sections: KPI
// tiles, channel-by-channel tables, geographic concentration, brand vs
// non-brand splits, ARGUS observations, recommended actions, etc.) and
// puts them inside the v7.3 modal chrome (header · scroll body · footer).
//
// This is ARION-specific because that's where the rich legacy renderers
// live; SPARK + OLIVER continue to use the generic ReportDetailModal
// until per-product rich content is built out.

import { X } from "lucide-react";
import { MonthlyScoreBars } from "./MonthlyScoreBars";
import {
  renderModalContent,
  ArgusInsightBox,
  MODAL_TITLES,
} from "../../arion/pages/analytics/IAInsightsReports";

// Engine reportKeys → legacy renderer keys (one mismatch: engine 'technical' → legacy 'tech').
function legacyKey(engineKey: string): string {
  if (engineKey === "technical") return "tech";
  return engineKey;
}

interface Props {
  /** Engine reportKey: visibility · audience · conversion · search · content · local · technical · presence */
  reportKey: string;
  /** Optional MoM score history for the chart strip at top of modal. */
  history?: Array<{ period_end: string; score: number }>;
  /** All ARION data sources that the rich renderers depend on. */
  data: any;
  searchData?: any;
  gbpData?: any;
  gbpReviews?: any;
  gbpPosts?: any;
  gbpQanda?: any;
  bingData?: any;
  seoData?: any;
  seoDecayData?: any;
  pluginData?: any;
  /** Period label e.g. "Q1 2026 · Jan 1 – Mar 31, 2026". */
  periodLabel?: string;
  /** Next-generated label e.g. "July 1, 2026". */
  nextLabel?: string;
  onClose: () => void;
}

export function ArionReportDetailModal({
  reportKey,
  history = [],
  data,
  searchData,
  gbpData,
  gbpReviews,
  gbpPosts,
  gbpQanda,
  bingData,
  seoData,
  seoDecayData,
  pluginData,
  periodLabel,
  nextLabel,
  onClose,
}: Props) {
  const k = legacyKey(reportKey);
  const title = MODAL_TITLES[k] || reportKey;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {periodLabel || "Latest period"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded text-slate-500 flex-shrink-0"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* MoM score history strip at the top (matches v7.3 modal pattern). */}
          {history.length >= 2 && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500">
                  Score history
                </div>
                <div className="text-[9px] text-slate-400">
                  {history.length} period{history.length === 1 ? "" : "s"}
                </div>
              </div>
              <MonthlyScoreBars data={history} width={700} height={92} />
            </div>
          )}

          {/* Legacy rich-content sections per report (KPI tiles, tables, breakdowns). */}
          <div className="report-rich-body">
            {renderModalContent(
              k,
              data,
              searchData,
              { gbp: gbpData, reviews: gbpReviews, posts: gbpPosts, qanda: gbpQanda },
              bingData,
              seoData,
              seoDecayData,
              pluginData
            )}
          </div>

          {/* ARGUS Intelligence box — dark, data-driven observations + actions. */}
          <ArgusInsightBox
            reportKey={k}
            data={data}
            searchData={searchData}
            gbpData={gbpData}
            gbpReviews={gbpReviews}
            gbpPosts={gbpPosts}
            gbpQanda={gbpQanda}
            bingData={bingData}
            seoData={seoData}
            seoDecayData={seoDecayData}
            pluginData={pluginData}
          />
        </div>

        {/* Sticky footer */}
        <div className="flex items-center justify-between border-t border-slate-200 px-6 py-3 bg-slate-50 rounded-b-lg flex-shrink-0">
          <div className="text-[11px] text-slate-500">
            Generated by{" "}
            <span className="font-semibold" style={{ color: "#6B9402" }}>
              ARGUS
            </span>
            {periodLabel && <> · {periodLabel.split("·")[0].trim()}</>}
            {nextLabel && <> · Next: {nextLabel}</>}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-slate-900 text-white rounded hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ArionReportDetailModal;
