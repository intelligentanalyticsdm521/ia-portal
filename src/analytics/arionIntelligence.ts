// arionIntelligence.ts — ARION Intelligence models (advanced, on the same data).
//
// Four models, each honest about the 12-month series it runs on:
//   1. Search Forecast     — project clicks / impressions / position / visibility
//   2. Conversion Forecast — project leads / conversions and the revenue behind them
//   3. Anomaly Radar       — every metric scanned vs its own baseline
//   4. Opportunity Model   — movers ranked by modelled impact (movement × value)
//
// Consumes the same MetricsPayload as Trends. Reuses intelligence.ts for the math.

import type { MetricsPayload } from "./arionDashboards";
import { linearForecast, detectAnomaly, weightedImpact, type Forecast, type Anomaly } from "./intelligence";

export interface ForecastCard {
  key: string; label: string; format: string; unit?: string;
  forecast: Forecast;
  headline: string;
}
export interface AnomalyCard {
  key: string; label: string; anomaly: Anomaly; headline: string;
}
export interface OpportunityCard {
  key: string; label: string; movementPct: number; weightValue: number; impact: number; headline: string;
}

export interface ArionIntelligence {
  searchForecast: ForecastCard[];
  conversionForecast: ForecastCard[];
  anomalies: AnomalyCard[];
  opportunities: OpportunityCard[];
  projectedRevenue: { value: number; low: number; high: number; confidence: string } | null;
}

const LABELS: Record<string, string> = {
  gsc_clicks: "Search Clicks", gsc_impressions: "Search Impressions",
  gsc_avg_position: "Average Position", kw_visibility: "Visibility Score",
  kw_top10: "Keywords in Top 10", ga_sessions: "Sessions",
  form_submissions: "Form Submissions", ga_conversions: "Conversions",
  gbp_calls: "Google Calls", gbp_directions: "Direction Requests",
  content_pageviews: "Page Views", ga_conversion_rate: "Conversion Rate",
};

function fmtNum(n: number): string {
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(Math.abs(n) < 10 ? 1 : 0);
}

function forecastCard(key: string, series: Array<number | null>, lowerIsBetter = false): ForecastCard | null {
  const f = linearForecast(series, 3);
  if (!f) return null;
  const proj = f.projected[2];
  const good = lowerIsBetter ? f.direction === "falling" : f.direction === "rising";
  const label = LABELS[key] || key;
  const dirWord = f.direction === "flat" ? "hold steady" : good ? "improve" : "decline";
  const headline = f.direction === "flat"
    ? `${label} is projected to hold near ${fmtNum(f.current)} over the next 3 months (${f.confidence} confidence).`
    : `${label} is on track to ${dirWord} to about ${fmtNum(proj)} within 3 months (${f.confidence} confidence).`;
  return { key, label, format: "number", forecast: f, headline };
}

export function buildArionIntelligence(payload: MetricsPayload): ArionIntelligence {
  const M = payload?.metrics || {};
  const has = (k: string) => Array.isArray(M[k]) && M[k].some((v) => v != null);

  const searchForecast = ["gsc_clicks", "gsc_impressions", "kw_visibility", "gsc_avg_position"]
    .filter(has)
    .map((k) => forecastCard(k, M[k], k === "gsc_avg_position"))
    .filter(Boolean) as ForecastCard[];

  const conversionForecast = ["form_submissions", "ga_conversions", "ga_sessions"]
    .filter(has)
    .map((k) => forecastCard(k, M[k]))
    .filter(Boolean) as ForecastCard[];

  // Anomaly radar across a broad metric set; keep only genuine anomalies.
  const anomalyKeys = ["gsc_clicks", "gsc_impressions", "gbp_calls", "gbp_directions", "form_submissions",
    "ga_sessions", "content_pageviews", "security_vulns", "lcp_ms", "gbp_review_velocity"];
  const anomalies: AnomalyCard[] = anomalyKeys.filter(has).map((k) => {
    const a = detectAnomaly(M[k]);
    if (!a || !a.isAnomaly) return null;
    const label = LABELS[k] || k;
    const headline = `${label} is running ${Math.abs(a.z).toFixed(1)} standard deviations ${a.direction} its normal range this month (${fmtNum(a.current)} vs typical ${fmtNum(a.baseline)}).`;
    return { key: k, label, anomaly: a, headline };
  }).filter(Boolean) as AnomalyCard[];

  // Opportunity: movers weighted by the value they carry. Use the metrics whose
  // absolute volume matters most, movement × current value.
  const oppKeys = ["gsc_clicks", "gsc_impressions", "kw_top10", "gbp_calls", "gbp_directions",
    "form_submissions", "content_pageviews", "ga_conversions"];
  const items = oppKeys.filter(has).map((k) => {
    const s = M[k].filter((v): v is number => v != null);
    if (s.length < 4) return null;
    const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
    const movementPct = ((cur - base) / Math.abs(base)) * 100;
    return { item: k, movementPct, weightValue: cur };
  }).filter(Boolean) as Array<{ item: string; movementPct: number; weightValue: number }>;
  const { ranked } = weightedImpact(items);
  const opportunities: OpportunityCard[] = ranked.slice(0, 6).map((r) => {
    const label = LABELS[r.item] || r.item;
    const up = r.movementPct >= 0;
    const headline = up
      ? `${label} is gaining and carries real volume — protecting this momentum has the biggest modelled upside.`
      : `${label} is slipping on high volume — recovering it is the single biggest lever available.`;
    return { key: r.item, label, movementPct: r.movementPct, weightValue: r.weightValue, impact: r.impact, headline };
  });

  // Projected revenue: forecast conversions × an assumed value per conversion.
  const convF = has("form_submissions") ? linearForecast(M.form_submissions, 3) : null;
  const VALUE_PER_LEAD = 180; // configurable in model review
  const projectedRevenue = convF ? {
    value: convF.projected[2] * VALUE_PER_LEAD,
    low: convF.bandLow[2] * VALUE_PER_LEAD,
    high: convF.bandHigh[2] * VALUE_PER_LEAD,
    confidence: convF.confidence,
  } : null;

  return { searchForecast, conversionForecast, anomalies, opportunities, projectedRevenue };
}
