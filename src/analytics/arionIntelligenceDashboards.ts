// arionIntelligenceDashboards.ts — Intelligence as the MIRROR of Trends.
//
// Brandon: Intelligence must mirror Trends — scored dashboards → clickable
// sections → detail reports — but the scores and detail are MODEL outputs, not
// movement counts. So this produces the exact same DashboardScore[] +
// DetailPayload types Trends uses, and renders through the same
// TrendDashboardView. The difference is entirely in how the numbers are made:
//
//   · Forecast dashboard   — each metric's score = forecast health (projected
//     direction × fit confidence). Detail = per-line-item trajectory (each
//     keyword's projected position, each query's projected clicks).
//   · Anomaly dashboard    — each section's score = inverse anomaly severity
//     (calm = high). Detail = which specific queries / referrals broke baseline.
//   · Opportunity dashboard— each section's score = realised vs available upside.
//     Detail = line items ranked by modelled impact (movement × volume).

import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore, SectionScore, DataPointScore } from "./scoring";
import { clamp } from "./scoring";
import { linearForecast, detectAnomaly, weightedImpact, type Forecast } from "./intelligence";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";
import { itemMom } from "./detail";

const LABEL: Record<string, string> = {
  gsc_clicks: "Search Clicks", gsc_impressions: "Search Impressions", kw_visibility: "Visibility Score",
  gsc_avg_position: "Average Position", kw_top10: "Keywords in Top 10", ga_sessions: "Sessions",
  ga_conversions: "Conversions", form_submissions: "Form Submissions", gbp_calls: "Google Calls",
  gbp_directions: "Direction Requests", content_pageviews: "Page Views", gbp_action_rate: "Action Rate",
  ga_engagement_rate: "Engagement Rate",
};
const lbl = (k: string) => LABEL[k] || k;

/** Forecast health → 0-100. Rising + confident = high; falling = low. */
function forecastScore(f: Forecast | null, higherIsBetter: boolean): number {
  if (!f) return 50;
  const good = higherIsBetter ? f.direction === "rising" : f.direction === "falling";
  const base = f.direction === "flat" ? 55 : good ? 78 : 30;
  const confAdj = f.confidence === "high" ? 12 : f.confidence === "medium" ? 4 : -4;
  // A good, confident trajectory scores high; a bad confident one scores low.
  return clamp(Math.round(base + (good ? confAdj : -confAdj)));
}

function dpFromForecast(key: string, series: Array<number | null>, higherIsBetter: boolean): DataPointScore {
  const f = linearForecast(series, 3);
  const proj = f ? f.projected[2] : null;
  const cur = series.filter((v): v is number => v != null).slice(-1)[0] ?? null;
  const momPct = f && cur ? ((proj! - cur) / Math.abs(cur)) * 100 : null;
  const score = forecastScore(f, higherIsBetter);
  return {
    key, label: lbl(key), format: key === "gsc_avg_position" ? "position" : "number", visual: "line",
    what: f ? `Projected to ${f.direction === "flat" ? "hold near" : "reach"} ${proj != null ? Math.round(proj).toLocaleString() : "—"} in 3 months · ${f.confidence} confidence (r²=${f.r2.toFixed(2)})` : "Not enough history to forecast.",
    series, current: proj, priorMonth: cur, movementPct: momPct, movementScore: score,
    levelScore: null, levelKind: null, score, weight: 1, higherIsBetter,
  };
}

function section(key: string, label: string, dps: DataPointScore[]): SectionScore {
  const measured = dps.filter((d) => !d.unmeasured);
  const score = measured.length ? clamp(Math.round(measured.reduce((s, d) => s + d.score, 0) / measured.length)) : null;
  const mom = measured.filter((d) => d.movementPct != null);
  return {
    key, label, score, priorScore: null,
    movementPct: mom.length ? mom.reduce((s, d) => s + d.movementPct!, 0) / mom.length : null,
    coverage: 100, dataPoints: dps, weight: 1,
  };
}

function dashboard(key: string, label: string, question: string, sections: SectionScore[]): DashboardScore {
  const measured = sections.filter((s) => s.score != null);
  const score = measured.length ? clamp(Math.round(measured.reduce((s, x) => s + x.score!, 0) / measured.length)) : null;
  const mom = measured.filter((s) => s.movementPct != null);
  const d: DashboardScore = {
    key, label, score, priorScore: null,
    movementPct: mom.length ? mom.reduce((s, x) => s + x.movementPct!, 0) / mom.length : null,
    coverage: 100, sections,
  };
  (d as any).question = question;
  return d;
}

export function buildArionIntelligenceDashboards(payload: MetricsPayload): { dashboards: DashboardScore[]; detail: DetailPayload } {
  const M = payload?.metrics || {};
  const D = payload?.detail || {};
  const has = (k: string) => Array.isArray(M[k]) && M[k].some((v) => v != null);
  const detail: DetailPayload = {};

  // ── FORECAST dashboard ──
  const fc = (k: string, hib = true) => (has(k) ? dpFromForecast(k, M[k], hib) : null);
  const searchFc = section("search_trajectory", "Search Trajectory", [fc("gsc_clicks"), fc("gsc_impressions"), fc("kw_visibility"), fc("gsc_avg_position", false)].filter(Boolean) as DataPointScore[]);
  const audFc = section("audience_trajectory", "Audience & Conversion Trajectory", [fc("ga_sessions"), fc("ga_conversions"), fc("form_submissions"), fc("ga_engagement_rate")].filter(Boolean) as DataPointScore[]);
  const localFc = section("local_trajectory", "Local Trajectory", [fc("gbp_calls"), fc("gbp_directions"), fc("gbp_action_rate")].filter(Boolean) as DataPointScore[]);
  const contentFc = section("content_trajectory", "Content Trajectory", [fc("content_pageviews")].filter(Boolean) as DataPointScore[]);
  const forecastDash = dashboard("forecast", "Forecast", "Where is every trend heading over the next 3 months?", [searchFc, audFc, localFc, contentFc]);

  // Forecast detail: per-line-item trajectory from the dimensioned detail.
  const projectItems = (rep: DetailReport | undefined): DetailItem[] => {
    if (!rep) return [];
    return rep.items.filter((it) => it.series?.length >= 4).map((it) => {
      const f = linearForecast(it.series, 3);
      const proj = f ? f.projected[2] : null;
      const cur = it.series.filter((v): v is number => v != null).slice(-1)[0] ?? null;
      return {
        name: it.name,
        series: f ? [...it.series, ...f.projected] : it.series,
        extra: {
          projected: proj != null ? Math.round(proj) : "—",
          confidence: f ? f.confidence : "—",
          ...(it.extra?.volume != null ? { volume: it.extra.volume } : {}),
        },
        momPct: f && cur ? ((proj! - cur) / Math.abs(cur)) * 100 : null,
      };
    });
  };
  if (D.query_performance) detail.query_forecast = { id: "query_forecast", section: "forecast.search_trajectory", label: "Query Trajectory — 3-month projection", itemLabel: "Query", primaryLabel: "Projected Clicks", format: "number", higherIsBetter: true, columns: [{ key: "projected", label: "Proj.", format: "number" }, { key: "confidence", label: "Conf", format: "text" }], items: projectItems(D.query_performance) };
  if (D.keyword_movement) detail.keyword_forecast = { id: "keyword_forecast", section: "forecast.search_trajectory", label: "Keyword Position Trajectory", itemLabel: "Keyword", primaryLabel: "Proj. Position", format: "position", higherIsBetter: false, columns: [{ key: "projected", label: "Proj.", format: "position" }, { key: "confidence", label: "Conf", format: "text" }, { key: "volume", label: "Volume", format: "number" }], items: projectItems(D.keyword_movement) };
  if (D.referral_sources) detail.referral_forecast = { id: "referral_forecast", section: "forecast.audience_trajectory", label: "Referral Source Trajectory", itemLabel: "Source", primaryLabel: "Proj. Sessions", format: "number", higherIsBetter: true, columns: [{ key: "projected", label: "Proj.", format: "number" }, { key: "confidence", label: "Conf", format: "text" }], items: projectItems(D.referral_sources) };

  // ── ANOMALY dashboard ──
  const anomDp = (k: string): DataPointScore | null => {
    if (!has(k)) return null;
    const a = detectAnomaly(M[k]);
    const sev = a ? Math.abs(a.z) : 0;
    const score = clamp(Math.round(100 - Math.min(100, sev * 25))); // z=0→100, z=4→0
    return {
      key: k, label: lbl(k), format: "number", visual: "line",
      what: a && a.isAnomaly ? `${Math.abs(a.z).toFixed(1)}σ ${a.direction} normal (${Math.round(a.current).toLocaleString()} vs typical ${Math.round(a.baseline).toLocaleString()})` : "Within normal range.",
      series: M[k], current: a?.current ?? null, priorMonth: a?.baseline ?? null,
      movementPct: a ? ((a.current - a.baseline) / Math.abs(a.baseline || 1)) * 100 : null,
      movementScore: score, levelScore: null, levelKind: null, score, weight: 1, higherIsBetter: true,
    };
  };
  const searchAnom = section("search_anomalies", "Search Anomalies", ["gsc_clicks", "gsc_impressions", "kw_visibility"].map(anomDp).filter(Boolean) as DataPointScore[]);
  const audAnom = section("audience_anomalies", "Audience Anomalies", ["ga_sessions", "form_submissions", "content_pageviews"].map(anomDp).filter(Boolean) as DataPointScore[]);
  const localAnom = section("local_anomalies", "Local Anomalies", ["gbp_calls", "gbp_directions"].map(anomDp).filter(Boolean) as DataPointScore[]);
  const techAnom = section("technical_anomalies", "Technical Anomalies", ["lcp_ms", "security_vulns"].map(anomDp).filter(Boolean) as DataPointScore[]);
  const anomalyDash = dashboard("anomaly", "Anomaly Radar", "What broke from its normal pattern this month?", [searchAnom, audAnom, localAnom, techAnom]);

  // Anomaly detail: per-line-item z-scores.
  const anomItems = (rep: DetailReport | undefined): DetailItem[] => {
    if (!rep) return [];
    return rep.items.filter((it) => it.series?.length >= 5).map((it) => {
      const a = detectAnomaly(it.series);
      return { name: it.name, series: it.series, momPct: itemMom(it), extra: { z: a ? Number(a.z.toFixed(1)) : 0, status: a && a.isAnomaly ? (a.severity === "alert" ? "Alert" : "Watch") : "Normal" } };
    }).sort((x, y) => Math.abs(Number(y.extra!.z)) - Math.abs(Number(x.extra!.z)));
  };
  if (D.query_performance) detail.query_anomaly = { id: "query_anomaly", section: "anomaly.search_anomalies", label: "Query Anomalies", itemLabel: "Query", primaryLabel: "Clicks", format: "number", higherIsBetter: true, columns: [{ key: "z", label: "σ", format: "number" }, { key: "status", label: "Status", format: "text" }], items: anomItems(D.query_performance) };
  if (D.referral_sources) detail.referral_anomaly = { id: "referral_anomaly", section: "anomaly.audience_anomalies", label: "Referral Anomalies", itemLabel: "Source", primaryLabel: "Sessions", format: "number", higherIsBetter: true, columns: [{ key: "z", label: "σ", format: "number" }, { key: "status", label: "Status", format: "text" }], items: anomItems(D.referral_sources) };

  // ── OPPORTUNITY dashboard ──
  const oppSection = (key: string, label: string, keys: string[]): SectionScore => {
    const items = keys.filter(has).map((k) => {
      const s = M[k].filter((v): v is number => v != null);
      const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
      return { item: k, movementPct: ((cur - base) / Math.abs(base)) * 100, weightValue: cur };
    });
    const { ranked } = weightedImpact(items);
    const dps: DataPointScore[] = ranked.map((r) => {
      // Opportunity score: a rising, high-volume item is a captured opportunity
      // (high); a falling high-volume item is a big open opportunity (low).
      const score = clamp(Math.round(60 + r.movementPct * 0.8));
      return {
        key: r.item, label: lbl(r.item), format: "number", visual: "line",
        what: r.movementPct >= 0 ? "Gaining on real volume — momentum to protect." : "Slipping on high volume — the biggest lever to recover.",
        series: M[r.item], current: r.weightValue, priorMonth: null,
        movementPct: r.movementPct, movementScore: score, levelScore: null, levelKind: null,
        score, weight: 1, higherIsBetter: true,
      };
    });
    return section(key, label, dps);
  };
  const kwOpp = oppSection("keyword_opps", "Keyword Opportunities", ["gsc_impressions", "kw_top10", "gsc_clicks"]);
  const contentOpp = oppSection("content_opps", "Content Opportunities", ["content_pageviews", "content_gap_count"]);
  const convOpp = oppSection("conversion_opps", "Conversion Opportunities", ["form_submissions", "ga_conversions"]);
  const localOpp = oppSection("local_opps", "Local Opportunities", ["gbp_calls", "gbp_directions", "gbp_website_clicks"]);
  const opportunityDash = dashboard("opportunity", "Opportunity Model", "Where does focus pay off most, weighted by volume?", [kwOpp, contentOpp, convOpp, localOpp]);

  // Opportunity detail: line items ranked by modelled impact.
  const oppItems = (rep: DetailReport | undefined): DetailItem[] => {
    if (!rep) return [];
    return rep.items.filter((it) => it.series?.length >= 4).map((it) => {
      const s = it.series.filter((v): v is number => v != null);
      const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
      const mom = ((cur - base) / Math.abs(base)) * 100;
      return { name: it.name, series: it.series, momPct: mom, extra: { impact: Math.round((mom / 100) * cur), ...(it.extra?.volume != null ? { volume: it.extra.volume } : {}) } };
    }).sort((x, y) => Math.abs(Number(y.extra!.impact)) - Math.abs(Number(x.extra!.impact)));
  };
  if (D.keyword_movement) detail.keyword_opp = { id: "keyword_opp", section: "opportunity.keyword_opps", label: "Keywords by Modelled Impact", itemLabel: "Keyword", primaryLabel: "Position", format: "position", higherIsBetter: false, columns: [{ key: "volume", label: "Volume", format: "number" }, { key: "impact", label: "Impact", format: "number" }], items: oppItems(D.keyword_movement) };
  if (D.query_performance) detail.query_opp = { id: "query_opp", section: "opportunity.keyword_opps", label: "Queries by Modelled Impact", itemLabel: "Query", primaryLabel: "Clicks", format: "number", higherIsBetter: true, columns: [{ key: "impact", label: "Impact", format: "number" }], items: oppItems(D.query_performance) };
  if (D.top_pages) detail.page_opp = { id: "page_opp", section: "opportunity.content_opps", label: "Pages by Modelled Impact", itemLabel: "Page", primaryLabel: "Views", format: "number", higherIsBetter: true, columns: [{ key: "impact", label: "Impact", format: "number" }], items: oppItems(D.top_pages) };

  return { dashboards: [forecastDash, anomalyDash, opportunityDash], detail };
}
