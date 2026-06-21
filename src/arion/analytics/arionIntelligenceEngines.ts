// arionIntelligenceEngines — v10.0 ARION Intelligence (SINGLE-SOURCE refactor).
//
// Brandon's locked architecture (2026-06-21): each ARION Intelligence
// report is SINGLE-SOURCE. The prior multi-platform reports (Lead Source
// Quality, Content ROI, Reputation → Revenue) have been relocated to
// ARGUS Cross-Channel Intelligence. ARION now hosts 6 reports that read
// from one ARION-owned data source each (SE Ranking, GSC, SE Ranking
// audit, IA Plugin, PageSpeed Insights).
//
// All real calculation happens server-side in arion-api/lib/intelligence/.
// This file now exposes:
//   - IntelligenceReport type (matches server payload)
//   - ArionIntelKey enum
//   - REPORT_META describing each card for the page UI
//   - A small client helper to fetch + normalize the aggregator response.
//
// Old engine functions remain exported as deprecated thin stubs so any
// in-flight import doesn't break at compile — they return the canonical
// "see new aggregator endpoint" insufficient_data stub.

import type { EngineInput } from "./trendEngines";

// ── Public types ─────────────────────────────────────────────────────────

export interface IntelligenceReport {
  score: number | null;
  state: "ok" | "partial" | "insufficient_data" | "locked";
  headline: string;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  dataGap?: string;
  /** Set by the server to identify which single data source produced this report. */
  source?: string;
  /** Human label provided by the server for display use. */
  label?: string;
  /** Tier grade derived from score (A|B|C|D). */
  tier?: "A" | "B" | "C" | "D" | null;
  /** Set when locked — required SEO tier. */
  requiredTier?: string;
}

export type ArionIntelKey =
  | "seo_authority"
  | "visibility_trajectory"
  | "competitive_presence"
  | "crawl_depth"
  | "schema_coverage"
  | "pagespeed_distribution";

// Match the server's REPORT_LABEL + REPORT_SOURCE constants.
export const ARION_INTEL_KEYS: ArionIntelKey[] = [
  "seo_authority",
  "visibility_trajectory",
  "competitive_presence",
  "crawl_depth",
  "schema_coverage",
  "pagespeed_distribution",
];

export interface IntelReportMeta {
  key: ArionIntelKey;
  label: string;
  question: string;
  source: string;
  /** Minimum SEO add-on tier to unlock. starter < essentials < growth < authority. */
  minTier: "starter" | "essentials" | "growth" | "authority";
}

export const ARION_INTEL_META: IntelReportMeta[] = [
  {
    key: "seo_authority",
    label: "SEO Authority Position",
    question: "How does my SEO authority compare to my tracked competitor pool?",
    source: "SE Ranking",
    minTier: "starter",
  },
  {
    key: "visibility_trajectory",
    label: "Visibility Trajectory",
    question: "Where will my search presence be in 90 days at current trajectory?",
    source: "Google Search Console",
    minTier: "essentials",
  },
  {
    key: "competitive_presence",
    label: "Competitive Presence Gap",
    question: "On what % of target keywords does a competitor outrank me?",
    source: "SE Ranking",
    minTier: "essentials",
  },
  {
    key: "crawl_depth",
    label: "Crawl Depth Score",
    question: "How completely does the SE Ranking crawler reach my site?",
    source: "SE Ranking audit",
    minTier: "growth",
  },
  {
    key: "schema_coverage",
    label: "Schema Markup Coverage",
    question: "What % of my pages have valid structured data?",
    source: "SE Ranking + IA Plugin",
    minTier: "authority",
  },
  {
    key: "pagespeed_distribution",
    label: "Page Speed Distribution",
    question: "What share of my pages hit Google's Core Web Vitals thresholds?",
    source: "PageSpeed Insights",
    minTier: "starter",
  },
];

export interface IntelligenceAggregateResponse {
  surface: "arion";
  reports: Record<ArionIntelKey, IntelligenceReport>;
  intelligenceScore: number | null;
  intelligenceTier: "A" | "B" | "C" | "D" | null;
  activeReports: number;
  totalReports: number;
  tier: string | null;
  calculated_at: string;
  source: "fresh" | "cache";
}

// ── Server-payload → typed report normalizer ─────────────────────────────

function normalizeReport(raw: any, key: ArionIntelKey): IntelligenceReport {
  if (!raw || typeof raw !== "object") {
    return {
      score: null, state: "insufficient_data",
      headline: "No data",
      scoreInputs: [], observations: [], actions: [],
      dataGap: "Awaiting first calculation.",
    };
  }
  const isLocked = raw.state === "locked" || raw.locked === true;
  return {
    score: typeof raw.score === "number" ? raw.score : null,
    state: isLocked ? "locked" : (raw.state || "insufficient_data"),
    headline: raw.narrative || raw.headline || "—",
    scoreInputs: Array.isArray(raw.components || raw.scoreInputs)
      ? (raw.components || raw.scoreInputs).map((c: any) => ({
          key: String(c?.key ?? ""),
          value: c?.value ?? null,
          weight: typeof c?.weight === "number" ? c.weight : 0,
          note: c?.note,
        }))
      : [],
    observations: Array.isArray(raw.observations) ? raw.observations : [],
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    dataGap: raw.dataGap || undefined,
    source: raw.source || undefined,
    label: raw.label || undefined,
    tier: raw.tier || null,
    requiredTier: raw.requiredTier || undefined,
  };
}

export function normalizeAggregateResponse(raw: any): IntelligenceAggregateResponse {
  const reportsRaw = raw?.reports || {};
  const reports = {} as Record<ArionIntelKey, IntelligenceReport>;
  for (const key of ARION_INTEL_KEYS) {
    reports[key] = normalizeReport(reportsRaw[key], key);
  }
  return {
    surface: "arion",
    reports,
    intelligenceScore: typeof raw?.intelligenceScore === "number" ? raw.intelligenceScore : null,
    intelligenceTier: raw?.intelligenceTier || null,
    activeReports: Number(raw?.activeReports) || 0,
    totalReports: Number(raw?.totalReports) || ARION_INTEL_KEYS.length,
    tier: typeof raw?.tier === "string" ? raw.tier : null,
    calculated_at: raw?.calculated_at || new Date().toISOString(),
    source: raw?.source === "cache" ? "cache" : "fresh",
  };
}

// ── Deprecated client-side engines (no-op stubs) ─────────────────────────
//
// These return an insufficient_data report so any lingering import
// compiles + renders harmlessly. All new code MUST hit the server
// /arion/sites/:siteId/intelligence aggregator instead.

const DEPRECATED_STUB: IntelligenceReport = {
  score: null, state: "insufficient_data",
  headline: "Migrated server-side — see /arion/sites/:siteId/intelligence",
  scoreInputs: [], observations: [
    "This engine moved to arion-api/lib/intelligence/. The Portal now fetches the aggregated payload from the server endpoint and renders directly — no client-side calculation.",
  ],
  actions: [],
  dataGap: "Client engine deprecated 2026-06-21 (single-source refactor).",
};

/** @deprecated Multi-platform — relocated to ARGUS Cross-Channel Intelligence. */
export function acquisitionEfficiencyEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Channel Intelligence. */
export function leadSourceQualityEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Channel Intelligence. */
export function contentRoiEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Channel Intelligence. */
export function reputationToRevenueEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Single-source but moved server-side. */
export function visibilityTrajectoryEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Single-source but moved server-side. */
export function competitivePresenceGapEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }

// Backwards-compat registry for any lingering code path; new code should
// use ARION_INTEL_META + the aggregator response shape directly.
export const ARION_INTEL_ENGINES = {
  seo_authority:         () => DEPRECATED_STUB,
  visibility_trajectory: () => DEPRECATED_STUB,
  competitive_presence:  () => DEPRECATED_STUB,
  crawl_depth:           () => DEPRECATED_STUB,
  schema_coverage:       () => DEPRECATED_STUB,
  pagespeed_distribution:() => DEPRECATED_STUB,
} as const;

/** @deprecated — fetch from /arion/sites/:siteId/intelligence instead. */
export function runAllArionIntelligence(_input: EngineInput): Record<ArionIntelKey, IntelligenceReport> {
  const out: Record<string, IntelligenceReport> = {};
  for (const k of ARION_INTEL_KEYS) out[k] = DEPRECATED_STUB;
  return out as Record<ArionIntelKey, IntelligenceReport>;
}
