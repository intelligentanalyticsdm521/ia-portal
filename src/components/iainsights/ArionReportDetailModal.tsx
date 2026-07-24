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
import { SectionCard } from "./SectionCard";
import { SectionDetail } from "./SectionDetail";
import { MonthlyScoreBars, MIN_HISTORY_PERIODS } from "./MonthlyScoreBars";
import {
  renderModalContent,
  ArgusInsightBox,
  MODAL_TITLES,
} from "../../arion/pages/analytics/IAInsightsReports";

// v11.0 six-report model → legacy renderer sections.
//
// The legacy renderModalContent()/ArgusInsightBox switch on the ORIGINAL
// single-topic keys ('visibility' | 'audience' | 'conversion' | 'search' |
// 'content' | 'local' | 'tech'). When Trends moved to six merged reports the
// new keys matched no case, so every modal rendered an empty body — score
// header and nothing else.
//
// A merged report renders BOTH of its constituent sections, in order. That
// keeps every KPI tile, table and breakdown the legacy renderers already
// produce instead of reimplementing them behind a new key.
const LEGACY_SECTIONS: Record<string, string[]> = {
  search_visibility:   ["visibility", "search"],
  audience_conversion: ["audience", "conversion"],
  local_presence:      ["local"],
  content:             ["content"],
  technical:           ["tech"],
  // social_presence has no legacy renderer — it is a new report. It falls
  // through to [] and renders the engine's own observations/actions only,
  // until a dedicated social section is built.
  social_presence:     [],
};

function legacySections(engineKey: string): string[] {
  if (LEGACY_SECTIONS[engineKey]) return LEGACY_SECTIONS[engineKey];
  // Unknown key — fall back to the pre-v11 behaviour so nothing regresses to
  // a blank modal again.
  return [engineKey === "technical" ? "tech" : engineKey];
}

/** Titles for the six-report model (the legacy MODAL_TITLES are per-section). */
const REPORT_TITLES: Record<string, string> = {
  search_visibility:   "Search Visibility",
  local_presence:      "Local Presence",
  social_presence:     "Social Presence",
  audience_conversion: "Audience & Conversion",
  content:             "Content",
  technical:           "Technical & Site Health",
};

export interface ScoreInput {
  key: string;
  value: number | string | null;
  weight: number;
  note?: string;
}

interface Props {
  /** Engine reportKey: visibility · audience · conversion · search · content · local · technical · presence */
  reportKey: string;
  /** Optional MoM score history for the chart strip at top of modal. */
  history?: Array<{ period_end: string; score: number }>;
  /** The engine's scoreInputs — the SECTIONS this report is built from. */
  scoreInputs?: ScoreInput[];
  /** Same sections last month, for the per-section MoM badge. */
  priorSections?: ScoreInput[] | null;
  /** Trailing monthly values per section key, oldest first — drives sparklines. */
  sectionHistory?: Record<string, number[]>;
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
  scoreInputs = [],
  priorSections = null,
  sectionHistory,
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
  const sections = legacySections(reportKey);
  // Prior month's value for one section, matched by key. Returns undefined
  // when there is no prior month so the card says "first month" rather than
  // inventing a change.
  const priorSectionValue = (key: string) =>
    priorSections?.find((p) => p.key === key)?.value ?? undefined;
  const title = REPORT_TITLES[reportKey] || MODAL_TITLES[sections[0]] || reportKey;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      {/* F-107 — canvas at the "report" standard (1400 × 90vh). Bespoke
          score-circle header documented as exception in Modal_Standards.md. */}
      <div
        className="bg-white rounded-lg shadow-2xl flex flex-col"
        style={{ width: "min(1400px, 94vw)", height: "90vh" }}
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
          {history.length >= MIN_HISTORY_PERIODS && (
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

          {/* ── SECTIONS — the major contributors to this report's score ──
              This is the primary body. Each card shows its month-over-month
              move and a plain-language blurb, and expands into the detail.
              The old behaviour dumped every KPI tile and table at the reader
              at once; that detail now lives BEHIND the section that owns it. */}
          {scoreInputs.length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-2">
                What is driving this score
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {scoreInputs.map((si) => (
                  <SectionCard
                    key={si.key}
                    sectionKey={si.key}
                    value={si.value as any}
                    priorValue={priorSectionValue(si.key)}
                    weight={si.weight}
                    note={si.note}
                    history={sectionHistory?.[si.key]}
                  >
                    {/* Detail reports — the level below the key section.
                        A section is several grouped detail reports, not one
                        table: dashboard -> key section -> detail report ->
                        data point, each level trended. */}
                    <SectionDetail
                      sectionKey={si.key}
                      value={si.value as any}
                      priorValue={priorSectionValue(si.key) as any}
                      data={data}
                      searchData={searchData}
                      gbpData={gbpData}
                      gbpReviews={gbpReviews}
                      gbpPosts={gbpPosts}
                      seoData={seoData}
                      pluginData={pluginData}
                    />
                  </SectionCard>
                ))}
              </div>
            </div>
          )}

          {/* Full breakdown — kept, but demoted below the sections and
              collapsed by default so it is a deep dive rather than the
              first thing a business owner is hit with. */}
          <details className="rounded-lg border border-slate-200 bg-white">
            <summary className="cursor-pointer select-none px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg">
              Full data breakdown
            </summary>
            <div className="border-t border-slate-100 px-4 py-3 space-y-5">
              {sections.map((s) => (
                <div className="report-rich-body" key={s}>
                  {renderModalContent(
                    s,
                    data,
                    searchData,
                    { gbp: gbpData, reviews: gbpReviews, posts: gbpPosts, qanda: gbpQanda },
                    bingData,
                    seoData,
                    seoDecayData,
                    pluginData
                  )}
                </div>
              ))}
            </div>
          </details>

          {/* Insights & Recommendations — an INSIGHT is the finding, the
              RECOMMENDATION is what to do about it. They are one paired unit,
              never two separate lists (Brandon, 2026-07-24). */}
          {sections.map((s) => (
            <ArgusInsightBox
              key={`insights-${s}`}
              reportKey={s}
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
          ))}
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
