// arionIntelligenceEngines — v10.0 ARION Intelligence (SINGLE-SOURCE refactor).
//
// Brandon's locked architecture (2026-06-21): each ARION Intelligence
// report is SINGLE-SOURCE. The prior multi-platform reports (Lead Source
// Quality, Content ROI, Reputation → Revenue) have been relocated to
// ARGUS Cross-Platform Intelligence. ARION now hosts 6 reports that read
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

// 2026-06-22 — Doc 64 canonical rework: ARION Intelligence expanded from 6 to 9 reports.
// crawl_depth + schema_coverage + seo_authority remain in the type union so
// existing cached payloads keep typechecking, but they are DEMOTED to
// score-inputs (per §4.2 of doc 64) and no longer rendered as top-level
// shelves. The 6 NEW reports below ship as `pending_implementation` stubs
// in Phase 1; their calculators come online in Phases 2-4 (doc 64 §8).
export type ArionIntelKey =
  // Still rendered (kept in the new 9-report shelf)
  | "visibility_trajectory"
  | "pagespeed_decay_forecast"
  | "site_audit_risk_prediction"
  | "keyword_position_trajectory"
  | "backlink_velocity_anomaly"
  | "content_quality_cluster"
  | "local_pack_visibility_forecast"
  | "crawl_budget_optimization"
  | "competitive_presence_gap"
  // Legacy keys — DEMOTED to score-inputs; keep in the type so any cached
  // payload still typechecks until the migration is complete.
  | "seo_authority"
  | "competitive_presence"
  | "crawl_depth"
  | "schema_coverage"
  | "pagespeed_distribution";

// Order matches the doc-64 §4.2 table.
export const ARION_INTEL_KEYS: ArionIntelKey[] = [
  "visibility_trajectory",
  "pagespeed_decay_forecast",
  "site_audit_risk_prediction",
  "keyword_position_trajectory",
  "backlink_velocity_anomaly",
  "content_quality_cluster",
  "local_pack_visibility_forecast",
  "crawl_budget_optimization",
  "competitive_presence_gap",
];

export interface IntelReportMeta {
  key: ArionIntelKey;
  label: string;
  question: string;
  source: string;
  /** Minimum product tier per doc-64 §2 (standard / pro / business). */
  minTier: "standard" | "pro" | "business";
  /** Data-floor blurb for the empty-state UX. */
  dataFloor: string;
  /** Doc-64 status for the migration-tracking ribbon. */
  status: "kept" | "new" | "demoted";
}

// 2026-06-22 — Doc 64 §4.2 canonical 9-report shelf.
// 3 KEPT + 6 NEW. Each NEW entry renders as a pending_implementation card
// in Phase 1; calculators come online in Phases 2-4.
export const ARION_INTEL_META: IntelReportMeta[] = [
  {
    key: "visibility_trajectory",
    label: "Visibility Trajectory",
    question: "Where will my search presence be in 90 days at current trajectory?",
    source: "Google Search Console",
    minTier: "standard",
    dataFloor: "60d for linear · 365d for Holt-Winters",
    status: "kept",
  },
  {
    key: "pagespeed_decay_forecast",
    label: "PageSpeed Decay Forecast",
    question: "Am I trending toward a Core Web Vitals failure?",
    source: "PageSpeed Insights + IA Plugin",
    minTier: "standard",
    dataFloor: "2 snapshots for distribution · 30+ for forecast",
    status: "kept",
  },
  {
    key: "site_audit_risk_prediction",
    label: "Site Audit Risk Prediction",
    question: "Which technical issues will spike at next audit?",
    source: "SE Ranking audit history",
    minTier: "pro",
    dataFloor: "3 completed audits",
    status: "new",
  },
  {
    key: "keyword_position_trajectory",
    label: "Keyword Position Trajectory",
    question: "Which keywords will move into or out of top-10 over the next 60 days?",
    source: "SE Ranking position history",
    minTier: "pro",
    dataFloor: "90d position history",
    status: "new",
  },
  {
    key: "backlink_velocity_anomaly",
    label: "Backlink Velocity Anomaly",
    question: "Is my link profile growing, decaying, or under attack?",
    source: "SE Ranking backlink stats",
    minTier: "pro",
    dataFloor: "60d backlink snapshots",
    status: "new",
  },
  {
    key: "content_quality_cluster",
    label: "Content Quality Cluster",
    question: "Which content groups pull weight vs which drag?",
    source: "IA Plugin RankMath + GA4 + GSC",
    minTier: "pro",
    dataFloor: "Plugin installed + 30d GA4",
    status: "new",
  },
  {
    key: "local_pack_visibility_forecast",
    label: "Local Pack Visibility Forecast",
    question: "Will I hold, gain, or lose local-pack visibility?",
    source: "GBP insights + reviews",
    minTier: "standard",
    dataFloor: "60d (90d for confident forecast)",
    status: "new",
  },
  {
    key: "crawl_budget_optimization",
    label: "Crawl Budget Optimization",
    question: "Which pages should the next audit prioritise?",
    source: "SE Ranking audit + GSC index coverage",
    minTier: "business",
    dataFloor: "1 audit + 90d GSC",
    status: "new",
  },
  {
    key: "competitive_presence_gap",
    label: "Competitive Presence Gap",
    question: "How is the gap between me and my tracked competitors changing?",
    source: "SE Ranking competitor visibility",
    minTier: "pro",
    dataFloor: "Essentials+ tracked competitors + 60d",
    status: "kept",
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

/** @deprecated Multi-platform — relocated to ARGUS Cross-Platform Intelligence. */
export function acquisitionEfficiencyEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Platform Intelligence. */
export function leadSourceQualityEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Platform Intelligence. */
export function contentRoiEngine(_input: EngineInput): IntelligenceReport { return DEPRECATED_STUB; }
/** @deprecated Multi-platform — relocated to ARGUS Cross-Platform Intelligence. */
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
