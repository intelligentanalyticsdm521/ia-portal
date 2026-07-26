// intelligenceMirror.ts — Intelligence as the mirror of Trends, organized by
// BUSINESS QUESTION (Brandon, 2026-07-25).
//
// The first cut named the Intelligence dashboards after modeling techniques
// (Forecast / Anomaly Radar / Opportunity Model). Wrong framing: owners ask
// business questions, not statistics questions. Intelligence dashboards now
// carry the promised business names — Demand Forecast, Cash Pressure, Churn
// Prediction, Campaign ROI — and the techniques live INSIDE them as sections:
// each dashboard mixes forecast, anomaly, and opportunity sections about that
// one question, with per-line-item modeled deep detail underneath.
//
// Same DashboardScore[] + DetailPayload shapes as Trends, rendered by the same
// TrendDashboardView + deep-report engine.
//
// HONEST EXCLUSIONS (documented, not faked): OLIVER "Margin Analysis" needs
// job-cost data (STELLA); SPARK "Optimal Send Time" needs hourly engagement
// data (we hold monthly). Both stay in the STELLA/new-data docs as unlocks.

import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore, SectionScore, DataPointScore } from "./scoring";
import { clamp } from "./scoring";
import { linearForecast, detectAnomaly, weightedImpact, type Forecast } from "./intelligence";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";
import { itemMom } from "./detail";

// ── config types ──────────────────────────────────────────────────────────
export type ModelKind = "forecast" | "anomaly" | "opportunity";
export interface MirrorMetric { k: string; hib?: boolean }
export interface MirrorSectionCfg { key: string; label: string; kind: ModelKind; metrics: MirrorMetric[] }
export interface MirrorDashCfg { key: string; label: string; question: string; sections: MirrorSectionCfg[] }
export interface MirrorDetailMap { from: string; id: string; section: string; label: string; kind: ModelKind }
export interface MirrorConfig {
  labels: Record<string, string>;
  dashboards: MirrorDashCfg[];
  detail?: MirrorDetailMap[];
  /** Report ids taken AS-IS from payload.detail into the Intelligence detail
   *  set — purpose-built model reports computed server-side (e.g. the CTR
   *  Opportunity title/meta rewrite list), not transforms of trend reports.
   *  Their `section` field must name an intelligence dashboard.section. */
  passthrough?: string[];
}

// ── model → data-point builders ───────────────────────────────────────────
function forecastScore(f: Forecast | null, higherIsBetter: boolean): number {
  if (!f) return 50;
  const good = higherIsBetter ? f.direction === "rising" : f.direction === "falling";
  const base = f.direction === "flat" ? 55 : good ? 78 : 30;
  const confAdj = f.confidence === "high" ? 12 : f.confidence === "medium" ? 4 : -4;
  return clamp(Math.round(base + (good ? confAdj : -confAdj)));
}

function buildDp(kind: ModelKind, k: string, label: string, series: Array<number | null>, hib: boolean): DataPointScore {
  if (kind === "forecast") {
    const f = linearForecast(series, 3);
    const proj = f ? f.projected[2] : null;
    const cur = series.filter((v): v is number => v != null).slice(-1)[0] ?? null;
    const score = forecastScore(f, hib);
    return {
      key: k, label, format: "number", visual: "line",
      what: f ? `Projected to ${f.direction === "flat" ? "hold near" : "reach"} ${proj != null ? Math.round(proj).toLocaleString() : "—"} in 3 months · ${f.confidence} confidence (r²=${f.r2.toFixed(2)})` : "Not enough history to forecast.",
      series, current: proj, priorMonth: cur,
      movementPct: f && cur ? ((proj! - cur) / Math.abs(cur || 1)) * 100 : null,
      movementScore: score, levelScore: null, levelKind: null, score, weight: 1, higherIsBetter: hib,
    };
  }
  if (kind === "anomaly") {
    const a = detectAnomaly(series);
    const sev = a ? Math.abs(a.z) : 0;
    const score = clamp(Math.round(100 - Math.min(100, sev * 25)));
    return {
      key: k, label, format: "number", visual: "line",
      what: a && a.isAnomaly ? `${Math.abs(a.z).toFixed(1)}σ ${a.direction} normal (${Math.round(a.current).toLocaleString()} vs typical ${Math.round(a.baseline).toLocaleString()})` : "Within its normal range.",
      series, current: a?.current ?? null, priorMonth: a?.baseline ?? null,
      movementPct: a ? ((a.current - a.baseline) / Math.abs(a.baseline || 1)) * 100 : null,
      movementScore: score, levelScore: null, levelKind: null, score, weight: 1, higherIsBetter: true,
    };
  }
  // opportunity
  const s = series.filter((v): v is number => v != null);
  const cur = s[s.length - 1] ?? 0, base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
  const mom = ((cur - base) / Math.abs(base)) * 100;
  const score = clamp(Math.round(60 + mom * 0.8));
  return {
    key: k, label, format: "number", visual: "line",
    what: mom >= 0 ? "Gaining on real volume — momentum to protect." : "Slipping on high volume — the biggest lever to recover.",
    series, current: cur, priorMonth: null,
    movementPct: mom, movementScore: score, levelScore: null, levelKind: null,
    score, weight: 1, higherIsBetter: true,
  };
}

// ── per-line-item detail transforms ───────────────────────────────────────
function projectItems(rep: DetailReport): DetailItem[] {
  return rep.items.filter((it) => (it.series?.length ?? 0) >= 4).map((it) => {
    const f = linearForecast(it.series, 3);
    const proj = f ? f.projected[2] : null;
    const cur = it.series.filter((v): v is number => v != null).slice(-1)[0] ?? null;
    return {
      name: it.name,
      series: f ? [...it.series, ...f.projected] : it.series,
      extra: {
        projected: proj != null ? Math.round(proj * 10) / 10 : "—",
        confidence: f ? f.confidence : "—",
        ...(it.extra?.volume != null ? { volume: it.extra.volume } : {}),
      },
      momPct: f && cur ? ((proj! - cur) / Math.abs(cur || 1)) * 100 : null,
    };
  });
}
function anomItems(rep: DetailReport): DetailItem[] {
  return rep.items.filter((it) => (it.series?.length ?? 0) >= 5).map((it) => {
    const a = detectAnomaly(it.series);
    return {
      name: it.name, series: it.series, momPct: itemMom(it),
      extra: { z: a ? Number(a.z.toFixed(1)) : 0, status: a && a.isAnomaly ? (a.severity === "alert" ? "Alert" : "Watch") : "Normal" },
    };
  }).sort((x, y) => Math.abs(Number(y.extra!.z)) - Math.abs(Number(x.extra!.z)));
}
function oppItems(rep: DetailReport): DetailItem[] {
  return rep.items.filter((it) => (it.series?.length ?? 0) >= 4).map((it) => {
    const s = it.series.filter((v): v is number => v != null);
    const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
    const mom = ((cur - base) / Math.abs(base)) * 100;
    return {
      name: it.name, series: it.series, momPct: mom,
      extra: { impact: Math.round((mom / 100) * cur), ...(it.extra?.volume != null ? { volume: it.extra.volume } : {}) },
    };
  }).sort((x, y) => Math.abs(Number(y.extra!.impact)) - Math.abs(Number(x.extra!.impact)));
}

const KIND_COLUMNS: Record<ModelKind, (src: DetailReport) => DetailReport["columns"]> = {
  forecast: (src) => [
    { key: "projected", label: "3-mo Proj.", format: src.format },
    { key: "confidence", label: "Conf", format: "text" },
    ...(src.items.some((i) => i.extra?.volume != null) ? [{ key: "volume", label: "Volume", format: "number" as const }] : []),
  ],
  anomaly: () => [{ key: "z", label: "σ", format: "number" }, { key: "status", label: "Status", format: "text" }],
  opportunity: (src) => [
    { key: "impact", label: "Modelled Impact", format: "number" },
    ...(src.items.some((i) => i.extra?.volume != null) ? [{ key: "volume", label: "Volume", format: "number" as const }] : []),
  ],
};
const KIND_TRANSFORM: Record<ModelKind, (rep: DetailReport) => DetailItem[]> = {
  forecast: projectItems, anomaly: anomItems, opportunity: oppItems,
};

// ── roll-ups ──────────────────────────────────────────────────────────────
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

// ── the builder ───────────────────────────────────────────────────────────
export function buildIntelligenceMirror(
  payload: MetricsPayload,
  cfg: MirrorConfig,
): { dashboards: DashboardScore[]; detail: DetailPayload } {
  const M = payload?.metrics || {};
  const D = payload?.detail || {};
  const has = (k: string) => Array.isArray(M[k]) && M[k].some((v) => v != null);
  const lbl = (k: string) => cfg.labels[k] || k;

  const dashboards: DashboardScore[] = cfg.dashboards.map((dc) => {
    const sections = dc.sections.map((sc) =>
      section(sc.key, sc.label, sc.metrics.filter((m) => has(m.k)).map((m) => buildDp(sc.kind, m.k, lbl(m.k), M[m.k], m.hib !== false))));
    const measured = sections.filter((s) => s.score != null);
    const score = measured.length ? clamp(Math.round(measured.reduce((s, x) => s + x.score!, 0) / measured.length)) : null;
    const mom = measured.filter((s) => s.movementPct != null);
    const d: DashboardScore = {
      key: dc.key, label: dc.label, score, priorScore: null,
      movementPct: mom.length ? mom.reduce((s, x) => s + x.movementPct!, 0) / mom.length : null,
      coverage: 100, sections,
    };
    (d as any).question = dc.question;
    return d;
  });

  const detail: DetailPayload = {};
  // Purpose-built model reports pass through untouched (already computed
  // server-side with their intelligence section set).
  for (const id of cfg.passthrough || []) {
    if (D[id]) detail[id] = D[id];
  }
  for (const map of cfg.detail || []) {
    const src = D[map.from];
    if (!src) continue;
    detail[map.id] = {
      id: map.id, section: map.section, label: map.label,
      itemLabel: src.itemLabel,
      primaryLabel: map.kind === "forecast" ? `Proj. ${src.primaryLabel || "value"}` : src.primaryLabel,
      format: src.format, higherIsBetter: src.higherIsBetter,
      columns: KIND_COLUMNS[map.kind](src),
      items: KIND_TRANSFORM[map.kind](src),
    };
  }

  return { dashboards, detail };
}

// ══ Platform configs — business-question dashboards ══════════════════════

export const ARION_MIRROR: MirrorConfig = {
  // Purpose-built model reports computed by the arion-api reader
  // (sections already point into these dashboards).
  passthrough: ["ctr_opportunity", "trend_breaks"],
  labels: {
    gsc_clicks: "Search Clicks", gsc_impressions: "Search Impressions", kw_visibility: "Visibility Score",
    gsc_avg_position: "Average Position", kw_top10: "Keywords in Top 10", ga_sessions: "Sessions",
    ga_conversions: "Conversions", form_submissions: "Form Submissions", gbp_calls: "Google Calls",
    gbp_directions: "Direction Requests", gbp_action_rate: "Action Rate", gbp_website_clicks: "Website Clicks",
    content_pageviews: "Page Views", lcp_ms: "Load Time (LCP)", security_vulns: "Vulnerabilities",
    ga_engagement_rate: "Engagement Rate",
  },
  dashboards: [
    { key: "visibility_trajectory", label: "Visibility Trajectory", question: "Where is your search presence heading?", sections: [
      { key: "search_forecast", label: "Search Forecast", kind: "forecast", metrics: [{ k: "gsc_clicks" }, { k: "gsc_impressions" }, { k: "kw_visibility" }, { k: "gsc_avg_position", hib: false }] },
      { key: "search_anomalies", label: "Search Anomalies", kind: "anomaly", metrics: [{ k: "gsc_clicks" }, { k: "gsc_impressions" }, { k: "kw_visibility" }] },
      { key: "ranking_opportunities", label: "Ranking Opportunities", kind: "opportunity", metrics: [{ k: "gsc_impressions" }, { k: "kw_top10" }, { k: "gsc_clicks" }] },
    ]},
    { key: "conversion_forecast", label: "Conversion Forecast", question: "Where are your leads and enquiries heading?", sections: [
      { key: "lead_forecast", label: "Lead Forecast", kind: "forecast", metrics: [{ k: "ga_sessions" }, { k: "ga_conversions" }, { k: "form_submissions" }, { k: "ga_engagement_rate" }] },
      { key: "funnel_anomalies", label: "Funnel Anomalies", kind: "anomaly", metrics: [{ k: "ga_sessions" }, { k: "form_submissions" }, { k: "content_pageviews" }] },
      { key: "conversion_opportunities", label: "Conversion Opportunities", kind: "opportunity", metrics: [{ k: "form_submissions" }, { k: "ga_conversions" }] },
    ]},
    { key: "local_momentum", label: "Local Momentum", question: "Is your local presence gaining or losing steam?", sections: [
      { key: "local_forecast", label: "Local Forecast", kind: "forecast", metrics: [{ k: "gbp_calls" }, { k: "gbp_directions" }, { k: "gbp_action_rate" }] },
      { key: "local_anomalies", label: "Local Anomalies", kind: "anomaly", metrics: [{ k: "gbp_calls" }, { k: "gbp_directions" }] },
      { key: "local_opportunities", label: "Local Opportunities", kind: "opportunity", metrics: [{ k: "gbp_calls" }, { k: "gbp_directions" }, { k: "gbp_website_clicks" }] },
    ]},
    { key: "content_site_risk", label: "Content & Site Risk", question: "Is your content compounding, and is the site putting anything at risk?", sections: [
      { key: "content_trajectory", label: "Content Trajectory", kind: "forecast", metrics: [{ k: "content_pageviews" }] },
      { key: "technical_anomalies", label: "Technical Anomalies", kind: "anomaly", metrics: [{ k: "lcp_ms" }, { k: "security_vulns" }] },
      { key: "content_opportunities", label: "Content Opportunities", kind: "opportunity", metrics: [{ k: "content_pageviews" }] },
    ]},
  ],
  detail: [
    { from: "keyword_movement", id: "keyword_forecast", section: "visibility_trajectory.search_forecast", label: "Keyword Position Trajectory", kind: "forecast" },
    { from: "query_performance", id: "query_forecast", section: "visibility_trajectory.search_forecast", label: "Query Trajectory — 3-month projection", kind: "forecast" },
    { from: "query_performance", id: "query_anomaly", section: "visibility_trajectory.search_anomalies", label: "Query Anomalies", kind: "anomaly" },
    { from: "keyword_movement", id: "keyword_opp", section: "visibility_trajectory.ranking_opportunities", label: "Keywords by Modelled Impact", kind: "opportunity" },
    { from: "query_performance", id: "query_opp", section: "visibility_trajectory.ranking_opportunities", label: "Queries by Modelled Impact", kind: "opportunity" },
    { from: "referral_sources", id: "referral_forecast", section: "conversion_forecast.lead_forecast", label: "Referral Source Trajectory", kind: "forecast" },
    { from: "referral_sources", id: "referral_anomaly", section: "conversion_forecast.funnel_anomalies", label: "Referral Anomalies", kind: "anomaly" },
    { from: "conversion_by_source", id: "conversion_opp", section: "conversion_forecast.conversion_opportunities", label: "Conversion Sources by Modelled Impact", kind: "opportunity" },
    { from: "gbp_action_breakdown", id: "local_forecast_detail", section: "local_momentum.local_forecast", label: "Customer Action Trajectory", kind: "forecast" },
    { from: "gbp_action_breakdown", id: "local_anomaly", section: "local_momentum.local_anomalies", label: "Customer Action Anomalies", kind: "anomaly" },
    { from: "gbp_action_breakdown", id: "local_opp", section: "local_momentum.local_opportunities", label: "Customer Actions by Modelled Impact", kind: "opportunity" },
    { from: "top_pages", id: "page_forecast", section: "content_site_risk.content_trajectory", label: "Page Trajectory — 3-month projection", kind: "forecast" },
    { from: "pagespeed_history", id: "speed_anomaly", section: "content_site_risk.technical_anomalies", label: "PageSpeed Anomalies", kind: "anomaly" },
    { from: "top_pages", id: "page_opp", section: "content_site_risk.content_opportunities", label: "Pages by Modelled Impact", kind: "opportunity" },
  ],
};

export const SPARK_MIRROR: MirrorConfig = {
  labels: {
    leads_new: "New Leads", leads_qualified: "Qualified Leads", customers_new: "New Customers",
    open_rate: "Open Rate", click_rate: "Click Rate", emails_sent: "Emails Sent",
    contacts_total: "Total Contacts", contacts_new: "New Contacts", bounce_rate: "Bounce Rate",
    unsub_rate: "Unsubscribe Rate", automation_executions: "Automation Runs",
    retention_high: "Healthy Contacts", retention_at_risk: "At-Risk Contacts",
  },
  dashboards: [
    { key: "churn_prediction", label: "Churn Prediction", question: "Which contacts are cooling off before they leave?", sections: [
      { key: "retention_forecast", label: "Retention Forecast", kind: "forecast", metrics: [{ k: "retention_high" }, { k: "retention_at_risk", hib: false }] },
      { key: "engagement_anomalies", label: "Engagement Anomalies", kind: "anomaly", metrics: [{ k: "open_rate" }, { k: "click_rate" }, { k: "unsub_rate" }] },
      { key: "winback_opportunities", label: "Win-back Opportunities", kind: "opportunity", metrics: [{ k: "retention_at_risk" }, { k: "contacts_total" }] },
    ]},
    { key: "campaign_roi", label: "Campaign ROI", question: "Is your email effort paying off, and where?", sections: [
      { key: "campaign_forecast", label: "Campaign Forecast", kind: "forecast", metrics: [{ k: "open_rate" }, { k: "click_rate" }, { k: "emails_sent" }] },
      { key: "deliverability_anomalies", label: "Deliverability Anomalies", kind: "anomaly", metrics: [{ k: "bounce_rate" }, { k: "unsub_rate" }] },
      { key: "campaign_opportunities", label: "Campaign Opportunities", kind: "opportunity", metrics: [{ k: "emails_sent" }, { k: "automation_executions" }] },
    ]},
    { key: "pipeline_value", label: "Pipeline & Customer Value", question: "Where are your leads and customers heading?", sections: [
      { key: "pipeline_forecast", label: "Pipeline Forecast", kind: "forecast", metrics: [{ k: "leads_new" }, { k: "leads_qualified" }, { k: "customers_new" }] },
      { key: "pipeline_anomalies", label: "Pipeline Anomalies", kind: "anomaly", metrics: [{ k: "leads_new" }, { k: "customers_new" }] },
      { key: "source_opportunities", label: "Source Opportunities", kind: "opportunity", metrics: [{ k: "leads_new" }, { k: "customers_new" }] },
    ]},
    { key: "list_growth", label: "List Growth Forecast", question: "Is your audience growing, and from where?", sections: [
      { key: "growth_forecast", label: "Growth Forecast", kind: "forecast", metrics: [{ k: "contacts_total" }, { k: "contacts_new" }] },
      { key: "growth_anomalies", label: "Growth Anomalies", kind: "anomaly", metrics: [{ k: "contacts_new" }] },
    ]},
  ],
  detail: [
    { from: "spark_engagement_cohorts", id: "spark_cohorts_fc", section: "churn_prediction.retention_forecast", label: "Engagement Cohort Trajectory", kind: "forecast" },
    { from: "spark_engagement_cohorts", id: "spark_cohorts_anom", section: "churn_prediction.engagement_anomalies", label: "Cohort Anomalies", kind: "anomaly" },
    { from: "spark_engagement_cohorts", id: "spark_cohorts_opp", section: "churn_prediction.winback_opportunities", label: "Cohorts by Modelled Impact", kind: "opportunity" },
    { from: "spark_sends_by_type", id: "spark_sends_fc", section: "campaign_roi.campaign_forecast", label: "Send Volume Trajectory by Type", kind: "forecast" },
    { from: "spark_bounce_domains", id: "spark_bounce_anom", section: "campaign_roi.deliverability_anomalies", label: "Bounce Anomalies by Provider", kind: "anomaly" },
    { from: "spark_automations", id: "spark_automations_opp", section: "campaign_roi.campaign_opportunities", label: "Automations by Modelled Impact", kind: "opportunity" },
    { from: "spark_lead_sources", id: "spark_lead_sources_fc", section: "pipeline_value.pipeline_forecast", label: "Lead Source Trajectory — 3-month projection", kind: "forecast" },
    { from: "spark_lead_sources", id: "spark_lead_sources_anom", section: "pipeline_value.pipeline_anomalies", label: "Lead Source Anomalies", kind: "anomaly" },
    { from: "spark_lead_sources", id: "spark_lead_sources_opp", section: "pipeline_value.source_opportunities", label: "Lead Sources by Modelled Impact", kind: "opportunity" },
    { from: "spark_contact_sources", id: "spark_contact_sources_fc", section: "list_growth.growth_forecast", label: "Contact Source Trajectory", kind: "forecast" },
    { from: "spark_contact_sources", id: "spark_contact_sources_anom", section: "list_growth.growth_anomalies", label: "Contact Source Anomalies", kind: "anomaly" },
  ],
};

export const OLIVER_MIRROR: MirrorConfig = {
  // Purpose-built model reports computed by the LUMEN metrics endpoint.
  passthrough: ["oliver_win_drivers"],
  labels: {
    revenue_collected: "Revenue Collected", recurring_revenue: "Recurring Revenue", jobs_completed: "Jobs Completed",
    jobs_scheduled: "Jobs Scheduled", on_time_rate: "On-Time Rate", quotes_sent: "Quotes Sent",
    quotes_accepted: "Quotes Accepted", outstanding_ar: "Outstanding AR", avg_days_to_pay: "Days to Pay",
    crew_utilization: "Crew Utilization", reschedule_rate: "Reschedule Rate", repeat_rate: "Repeat Rate",
    booked_ahead_days: "Booked-Ahead Days", idle_capacity: "Idle Capacity",
  },
  dashboards: [
    { key: "demand_forecast", label: "Demand Forecast", question: "How much work is coming, and can you staff it?", sections: [
      { key: "job_forecast", label: "Job Volume Forecast", kind: "forecast", metrics: [{ k: "jobs_completed" }, { k: "jobs_scheduled" }, { k: "booked_ahead_days" }] },
      { key: "demand_anomalies", label: "Demand Anomalies", kind: "anomaly", metrics: [{ k: "jobs_completed" }, { k: "reschedule_rate" }] },
      { key: "demand_opportunities", label: "Demand Opportunities", kind: "opportunity", metrics: [{ k: "jobs_completed" }, { k: "jobs_scheduled" }] },
    ]},
    { key: "cash_pressure", label: "Cash Pressure", question: "Is cash coming in on time, or building up in receivables?", sections: [
      { key: "cash_forecast", label: "Cash Forecast", kind: "forecast", metrics: [{ k: "revenue_collected" }, { k: "avg_days_to_pay", hib: false }, { k: "outstanding_ar", hib: false }] },
      { key: "ar_anomalies", label: "Receivables Anomalies", kind: "anomaly", metrics: [{ k: "outstanding_ar" }, { k: "revenue_collected" }] },
    ]},
    { key: "pipeline_revenue", label: "Pipeline Revenue", question: "What will your quotes turn into?", sections: [
      { key: "quote_forecast", label: "Quote Forecast", kind: "forecast", metrics: [{ k: "quotes_sent" }, { k: "quotes_accepted" }] },
      { key: "pipeline_anomalies", label: "Pipeline Anomalies", kind: "anomaly", metrics: [{ k: "quotes_sent" }, { k: "quotes_accepted" }] },
      { key: "pipeline_opportunities", label: "Pipeline Opportunities", kind: "opportunity", metrics: [{ k: "quotes_accepted" }, { k: "quotes_sent" }] },
    ]},
    { key: "churn_retention", label: "Churn & Retention", question: "Which customers and contracts are at risk?", sections: [
      { key: "retention_forecast", label: "Retention Forecast", kind: "forecast", metrics: [{ k: "recurring_revenue" }, { k: "repeat_rate" }] },
      { key: "customer_anomalies", label: "Customer Anomalies", kind: "anomaly", metrics: [{ k: "recurring_revenue" }] },
      { key: "retention_opportunities", label: "Retention Opportunities", kind: "opportunity", metrics: [{ k: "recurring_revenue" }, { k: "revenue_collected" }] },
    ]},
    { key: "crew_utilisation", label: "Crew Utilisation", question: "Is the team loaded right — not idle, not burning out?", sections: [
      { key: "utilization_forecast", label: "Utilization Forecast", kind: "forecast", metrics: [{ k: "crew_utilization" }, { k: "on_time_rate" }, { k: "idle_capacity", hib: false }] },
      { key: "crew_anomalies", label: "Crew Anomalies", kind: "anomaly", metrics: [{ k: "crew_utilization" }, { k: "reschedule_rate" }] },
    ]},
  ],
  detail: [
    { from: "oliver_jobs_by_service", id: "oliver_jobs_fc", section: "demand_forecast.job_forecast", label: "Jobs by Service Trajectory", kind: "forecast" },
    { from: "oliver_jobs_by_service", id: "oliver_jobs_anom", section: "demand_forecast.demand_anomalies", label: "Service Line Demand Anomalies", kind: "anomaly" },
    { from: "oliver_jobs_by_service", id: "oliver_jobs_opp", section: "demand_forecast.demand_opportunities", label: "Service Lines by Demand Impact", kind: "opportunity" },
    { from: "oliver_revenue_by_service", id: "oliver_revenue_fc", section: "cash_pressure.cash_forecast", label: "Revenue by Service — 3-month projection", kind: "forecast" },
    { from: "oliver_invoice_aging", id: "oliver_aging_anom", section: "cash_pressure.ar_anomalies", label: "Aging Bucket Anomalies", kind: "anomaly" },
    { from: "oliver_quotes_by_service", id: "oliver_quotes_fc", section: "pipeline_revenue.quote_forecast", label: "Quotes by Service Trajectory", kind: "forecast" },
    { from: "oliver_quotes_by_service", id: "oliver_quotes_opp", section: "pipeline_revenue.pipeline_opportunities", label: "Quote Lines by Modelled Impact", kind: "opportunity" },
    { from: "oliver_recurring_contracts", id: "oliver_contracts_fc", section: "churn_retention.retention_forecast", label: "Recurring Contract Trajectory", kind: "forecast" },
    { from: "oliver_top_customers", id: "oliver_customers_anom", section: "churn_retention.customer_anomalies", label: "Top Customer Anomalies", kind: "anomaly" },
    { from: "oliver_top_customers", id: "oliver_customers_opp", section: "churn_retention.retention_opportunities", label: "Customers by Modelled Impact", kind: "opportunity" },
    { from: "oliver_crew_performance", id: "oliver_crew_fc", section: "crew_utilisation.utilization_forecast", label: "Crew Utilization Trajectory", kind: "forecast" },
    { from: "oliver_crew_performance", id: "oliver_crew_anom", section: "crew_utilisation.crew_anomalies", label: "Crew Anomalies", kind: "anomaly" },
  ],
};

export const ARGUS_MIRROR: MirrorConfig = {
  labels: {
    journey_leads: "Leads", journey_customers: "New Customers", journey_revenue: "Attributed Revenue",
    journey_visits: "Website Visits", journey_impressions: "Total Impressions", platform_events: "Platform Events",
    integrations_healthy: "Healthy Integrations", automation_runs: "Automation Runs", data_freshness: "Data Freshness",
  },
  dashboards: [
    { key: "revenue_journey", label: "Revenue Journey", question: "Across every product — where are leads, customers, and revenue heading?", sections: [
      { key: "funnel_forecast", label: "Funnel Forecast", kind: "forecast", metrics: [{ k: "journey_leads" }, { k: "journey_customers" }, { k: "journey_revenue" }] },
      { key: "reach_forecast", label: "Reach Forecast", kind: "forecast", metrics: [{ k: "journey_impressions" }, { k: "journey_visits" }] },
      { key: "funnel_anomalies", label: "Funnel Anomalies", kind: "anomaly", metrics: [{ k: "journey_impressions" }, { k: "journey_visits" }, { k: "journey_leads" }, { k: "journey_customers" }] },
      { key: "journey_opportunities", label: "Journey Opportunities", kind: "opportunity", metrics: [{ k: "journey_impressions" }, { k: "journey_visits" }, { k: "journey_leads" }, { k: "journey_customers" }] },
    ]},
    { key: "platform_health", label: "Platform Connectivity & Data Quality", question: "Are the products connected, syncing, and trustworthy?", sections: [
      { key: "event_forecast", label: "Event Flow Forecast", kind: "forecast", metrics: [{ k: "platform_events" }, { k: "automation_runs" }] },
      { key: "connectivity_anomalies", label: "Connectivity Anomalies", kind: "anomaly", metrics: [{ k: "platform_events" }, { k: "integrations_healthy" }, { k: "data_freshness" }] },
    ]},
  ],
  detail: [
    { from: "argus_leads_by_source", id: "argus_leads_fc", section: "revenue_journey.funnel_forecast", label: "Lead Sources — 3-month projection", kind: "forecast" },
    { from: "argus_revenue_by_source", id: "argus_revenue_fc", section: "revenue_journey.funnel_forecast", label: "Revenue by Source Trajectory", kind: "forecast" },
    { from: "argus_impressions_by_channel", id: "argus_impr_fc", section: "revenue_journey.reach_forecast", label: "Impressions by Channel Trajectory", kind: "forecast" },
    { from: "argus_impressions_by_channel", id: "argus_impr_anom", section: "revenue_journey.funnel_anomalies", label: "Channel Anomalies", kind: "anomaly" },
    { from: "argus_revenue_by_source", id: "argus_revenue_opp", section: "revenue_journey.journey_opportunities", label: "Revenue Sources by Modelled Impact", kind: "opportunity" },
    { from: "argus_events_by_product", id: "argus_events_fc", section: "platform_health.event_forecast", label: "Event Flow Trajectory by Product", kind: "forecast" },
    { from: "argus_events_by_product", id: "argus_events_anom", section: "platform_health.connectivity_anomalies", label: "Event Flow Anomalies by Product", kind: "anomaly" },
  ],
};
