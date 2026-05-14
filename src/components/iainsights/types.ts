// types.ts — Shared types for the IA Insights architecture (v5.x).
//
// Implements the 4-gauge + 2 bar-chart framework defined in
// IA_Intelligence_Insights_Architecture_Handoff_v1_0.docx (May 2026).
// Used by ARION, SPARK, OLIVER, and ARGUS IA Insights surfaces.

export type ProductKey = "arion" | "spark" | "oliver" | "stella" | "argus";
export type TierKey = "standard" | "pro" | "business";

/** A single gauge reading. */
export interface GaugeValue {
  /** Score 0-100 (rounded). */
  score: number;
  /** Prior period score for directional comparison. Optional — gauges still render without it. */
  previousScore?: number | null;
  /** Health band derived from the score (green/amber/red). */
  band: "green" | "amber" | "red" | "unknown";
  /** When the gauge is locked or has insufficient data, set state + message. */
  state?: "ok" | "locked" | "insufficient_data";
  /** Optional human-readable explanation shown under the gauge. */
  message?: string;
  /** Optional link to drill into the source of the score (e.g. ARGUS for the overall gauge). */
  drillTo?: string;
}

/** A single bar in the breakdown bar charts. */
export interface ScoreBreakdownBar {
  key: string;
  label: string;
  score: number;
  /** Prior period score — renders as a ghost bar overlay. */
  previousScore?: number | null;
  /** Band coloring identical to the gauges. */
  band: "green" | "amber" | "red" | "unknown";
  /** Bars that are tier- or data-locked render greyed with a lock icon. */
  locked?: boolean;
  lockReason?: string;
  /** Drill-down route into the underlying report. */
  reportRoute?: string;
}

/** Banner shown above the gauges when data is incomplete. */
export interface InsightDataGapBanner {
  /** Severity drives styling. */
  severity: "info" | "warn";
  /** Plain-language message. NEVER "Upgrade to Pro" — always "Connect X". */
  message: string;
  /** Optional CTA (e.g. open Settings → Connected Accounts). */
  action?: { label: string; route?: string };
}

/** Full payload for the 5-gauge + 3 bar-chart header (v9.0). */
export interface IAInsightsHeaderData {
  product: ProductKey;
  /** "Business Pulse" — same across every product (sourced from ARGUS). */
  overall: GaugeValue;
  /** "Platform Score" — weighted: Trend 35% + Intelligence 35% + Cross-Channel 30%. */
  platform: GaugeValue;
  /** "Trend Score" — weighted composite of the Trend report scores below. */
  trend: GaugeValue;
  /** "Intelligence Score" — weighted composite of the Intelligence reports. Locked at Standard tier. */
  intelligence: GaugeValue;
  /** "Cross-Channel Score" — composite of cross-channel reports anchored to this product (v9.0). */
  crossChannel?: GaugeValue;
  /** Left bar chart — Trend Score breakdown by category. */
  trendBreakdown: ScoreBreakdownBar[];
  /** Centre bar chart — Intelligence Score breakdown by category. Greyed when locked. */
  intelligenceBreakdown: ScoreBreakdownBar[];
  /** Right bar chart — Cross-Channel Score breakdown by anchored report (v9.0). */
  crossChannelBreakdown?: ScoreBreakdownBar[];
  /** Banners surfaced above the header. */
  banners?: InsightDataGapBanner[];
  /** Generation metadata for "Generated at …" footer + period selectors. */
  meta: {
    generatedAt: string;
    periodStart?: string;
    periodEnd?: string;
    tier: TierKey;
  };
}

/** Cross-channel empty-state classification (v9.0 spec §1.7). */
export type CrossChannelEmptyState = "activation" | "collecting" | "partial" | "ok";

/** Platform Score fallback rules from spec §1.4. Returns weights summing to 1.0. */
export function platformScoreWeights(opts: { hasTrend: boolean; hasIntelligence: boolean; hasCrossChannel: boolean }): { trend: number; intelligence: number; crossChannel: number } {
  const { hasTrend, hasIntelligence, hasCrossChannel } = opts;
  if (!hasTrend) return { trend: 0, intelligence: 0, crossChannel: 0 };  // No trend = no score
  if (hasIntelligence && hasCrossChannel) return { trend: 0.35, intelligence: 0.35, crossChannel: 0.30 };
  if (!hasIntelligence && hasCrossChannel) return { trend: 0.55, intelligence: 0, crossChannel: 0.45 };
  if (hasIntelligence && !hasCrossChannel) return { trend: 0.50, intelligence: 0.50, crossChannel: 0 };
  return { trend: 1.0, intelligence: 0, crossChannel: 0 };  // Trend only
}

/** Band thresholds — shared across all gauges/bars so colors are consistent. */
export function bandFromScore(score: number | null | undefined): GaugeValue["band"] {
  if (score == null || !isFinite(score)) return "unknown";
  if (score >= 70) return "green";
  if (score >= 50) return "amber";
  return "red";
}

/** Color tokens — `#16A34A` green, `#EAB308` amber, `#DC2626` red, slate for unknown. */
export const BAND_COLORS: Record<GaugeValue["band"], string> = {
  green: "#16A34A",
  amber: "#EAB308",
  red: "#DC2626",
  unknown: "#94A3B8",
};

/** Product brand colors used in gauge accents + cross-product context. */
export const PRODUCT_COLORS: Record<ProductKey, string> = {
  arion: "#1A7DB5",
  spark: "#EF6C33",
  oliver: "#FEC82C",
  stella: "#9333EA",
  argus: "#0F766E",
};
