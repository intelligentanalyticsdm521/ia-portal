// intelligenceMirror.ts — Intelligence as the mirror of Trends, for ANY platform.
//
// Produces the same DashboardScore[] + DetailPayload shapes Trends uses, so the
// same TrendDashboardView (and the same deep-report engine) renders it. The
// content is modeled instead of counted:
//
//   Forecast dashboard    — metrics scored by forecast health (projected
//     direction × r² confidence); detail = per-line-item 3-month projections.
//   Anomaly Radar         — sections scored by inverse anomaly severity;
//     detail = which specific line items broke their own baseline (z-scores).
//   Opportunity Model     — scored by realised vs available upside; detail =
//     line items ranked by modelled impact (movement × volume carried).
//
// Each platform supplies a MirrorConfig naming which metrics feed which
// section and which trend detail reports get projected / anomaly-scanned /
// impact-ranked. ARION/SPARK/OLIVER/ARGUS configs live at the bottom.

import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore, SectionScore, DataPointScore } from "./scoring";
import { clamp } from "./scoring";
import { linearForecast, detectAnomaly, weightedImpact, type Forecast } from "./intelligence";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";
import { itemMom } from "./detail";

// ── config types ──────────────────────────────────────────────────────────
export interface MirrorMetric { k: string; hib?: boolean }
export interface MirrorSectionDef { key: string; label: string; metrics: MirrorMetric[] }
export interface MirrorAnomSectionDef { key: string; label: string; metrics: string[] }
export interface MirrorDetailMap { from: string; id: string; section: string; label: string }
export interface MirrorConfig {
  labels: Record<string, string>;
  forecastSections: MirrorSectionDef[];
  anomalySections: MirrorAnomSectionDef[];
  opportunitySections: MirrorAnomSectionDef[];
  forecastDetail?: MirrorDetailMap[];
  anomalyDetail?: MirrorDetailMap[];
  opportunityDetail?: MirrorDetailMap[];
}

// ── scoring helpers ───────────────────────────────────────────────────────
function forecastScore(f: Forecast | null, higherIsBetter: boolean): number {
  if (!f) return 50;
  const good = higherIsBetter ? f.direction === "rising" : f.direction === "falling";
  const base = f.direction === "flat" ? 55 : good ? 78 : 30;
  const confAdj = f.confidence === "high" ? 12 : f.confidence === "medium" ? 4 : -4;
  return clamp(Math.round(base + (good ? confAdj : -confAdj)));
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

// ── per-line-item model transforms ────────────────────────────────────────
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

// ── the builder ───────────────────────────────────────────────────────────
export function buildIntelligenceMirror(
  payload: MetricsPayload,
  cfg: MirrorConfig,
): { dashboards: DashboardScore[]; detail: DetailPayload } {
  const M = payload?.metrics || {};
  const D = payload?.detail || {};
  const has = (k: string) => Array.isArray(M[k]) && M[k].some((v) => v != null);
  const lbl = (k: string) => cfg.labels[k] || k;
  const detail: DetailPayload = {};

  // Forecast
  const fcSections = cfg.forecastSections.map((sd) => section(sd.key, sd.label,
    sd.metrics.filter((m) => has(m.k)).map((m) => {
      const hib = m.hib !== false;
      const f = linearForecast(M[m.k], 3);
      const proj = f ? f.projected[2] : null;
      const cur = M[m.k].filter((v): v is number => v != null).slice(-1)[0] ?? null;
      const score = forecastScore(f, hib);
      return {
        key: m.k, label: lbl(m.k), format: "number", visual: "line",
        what: f ? `Projected to ${f.direction === "flat" ? "hold near" : "reach"} ${proj != null ? Math.round(proj).toLocaleString() : "—"} in 3 months · ${f.confidence} confidence (r²=${f.r2.toFixed(2)})` : "Not enough history to forecast.",
        series: M[m.k], current: proj, priorMonth: cur,
        movementPct: f && cur ? ((proj! - cur) / Math.abs(cur || 1)) * 100 : null,
        movementScore: score, levelScore: null, levelKind: null, score, weight: 1, higherIsBetter: hib,
      } as DataPointScore;
    })));
  const forecastDash = dashboard("forecast", "Forecast", "Where is every trend heading over the next 3 months?", fcSections);

  for (const map of cfg.forecastDetail || []) {
    const src = D[map.from];
    if (!src) continue;
    detail[map.id] = {
      id: map.id, section: map.section, label: map.label,
      itemLabel: src.itemLabel, primaryLabel: `Proj. ${src.primaryLabel || "value"}`,
      format: src.format, higherIsBetter: src.higherIsBetter,
      columns: [
        { key: "projected", label: "3-mo Proj.", format: src.format },
        { key: "confidence", label: "Conf", format: "text" },
        ...(src.items.some((i) => i.extra?.volume != null) ? [{ key: "volume", label: "Volume", format: "number" as const }] : []),
      ],
      items: projectItems(src),
    };
  }

  // Anomaly
  const anomSections = cfg.anomalySections.map((sd) => section(sd.key, sd.label,
    sd.metrics.filter(has).map((k) => {
      const a = detectAnomaly(M[k]);
      const sev = a ? Math.abs(a.z) : 0;
      const score = clamp(Math.round(100 - Math.min(100, sev * 25)));
      return {
        key: k, label: lbl(k), format: "number", visual: "line",
        what: a && a.isAnomaly ? `${Math.abs(a.z).toFixed(1)}σ ${a.direction} normal (${Math.round(a.current).toLocaleString()} vs typical ${Math.round(a.baseline).toLocaleString()})` : "Within normal range.",
        series: M[k], current: a?.current ?? null, priorMonth: a?.baseline ?? null,
        movementPct: a ? ((a.current - a.baseline) / Math.abs(a.baseline || 1)) * 100 : null,
        movementScore: score, levelScore: null, levelKind: null, score, weight: 1, higherIsBetter: true,
      } as DataPointScore;
    })));
  const anomalyDash = dashboard("anomaly", "Anomaly Radar", "What broke from its normal pattern this month?", anomSections);

  for (const map of cfg.anomalyDetail || []) {
    const src = D[map.from];
    if (!src) continue;
    detail[map.id] = {
      id: map.id, section: map.section, label: map.label,
      itemLabel: src.itemLabel, primaryLabel: src.primaryLabel, format: src.format, higherIsBetter: src.higherIsBetter,
      columns: [{ key: "z", label: "σ", format: "number" }, { key: "status", label: "Status", format: "text" }],
      items: anomItems(src),
    };
  }

  // Opportunity
  const oppSections = cfg.opportunitySections.map((sd) => {
    const items = sd.metrics.filter(has).map((k) => {
      const s = M[k].filter((v): v is number => v != null);
      const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
      return { item: k, movementPct: ((cur - base) / Math.abs(base)) * 100, weightValue: cur };
    });
    const { ranked } = weightedImpact(items);
    return section(sd.key, sd.label, ranked.map((r) => ({
      key: r.item, label: lbl(r.item), format: "number", visual: "line",
      what: r.movementPct >= 0 ? "Gaining on real volume — momentum to protect." : "Slipping on high volume — the biggest lever to recover.",
      series: M[r.item], current: r.weightValue, priorMonth: null,
      movementPct: r.movementPct, movementScore: clamp(Math.round(60 + r.movementPct * 0.8)),
      levelScore: null, levelKind: null,
      score: clamp(Math.round(60 + r.movementPct * 0.8)), weight: 1, higherIsBetter: true,
    } as DataPointScore)));
  });
  const opportunityDash = dashboard("opportunity", "Opportunity Model", "Where does focus pay off most, weighted by volume?", oppSections);

  for (const map of cfg.opportunityDetail || []) {
    const src = D[map.from];
    if (!src) continue;
    detail[map.id] = {
      id: map.id, section: map.section, label: map.label,
      itemLabel: src.itemLabel, primaryLabel: src.primaryLabel, format: src.format, higherIsBetter: src.higherIsBetter,
      columns: [
        { key: "impact", label: "Modelled Impact", format: "number" },
        ...(src.items.some((i) => i.extra?.volume != null) ? [{ key: "volume", label: "Volume", format: "number" as const }] : []),
      ],
      items: oppItems(src),
    };
  }

  return { dashboards: [forecastDash, anomalyDash, opportunityDash], detail };
}

// ── platform configs ──────────────────────────────────────────────────────
export const SPARK_MIRROR: MirrorConfig = {
  labels: {
    leads_new: "New Leads", leads_qualified: "Qualified Leads", customers_new: "New Customers",
    open_rate: "Open Rate", click_rate: "Click Rate", emails_sent: "Emails Sent",
    contacts_total: "Total Contacts", contacts_new: "New Contacts", bounce_rate: "Bounce Rate",
    unsub_rate: "Unsubscribe Rate", optout_rate: "Opt-Out Rate", automation_executions: "Automation Runs",
  },
  forecastSections: [
    { key: "pipeline_trajectory", label: "Pipeline Trajectory", metrics: [{ k: "leads_new" }, { k: "leads_qualified" }, { k: "customers_new" }] },
    { key: "engagement_trajectory", label: "Engagement Trajectory", metrics: [{ k: "open_rate" }, { k: "click_rate" }, { k: "emails_sent" }] },
    { key: "list_trajectory", label: "List Trajectory", metrics: [{ k: "contacts_total" }, { k: "contacts_new" }] },
  ],
  anomalySections: [
    { key: "pipeline_anomalies", label: "Pipeline Anomalies", metrics: ["leads_new", "customers_new", "contacts_new"] },
    { key: "engagement_anomalies", label: "Engagement Anomalies", metrics: ["open_rate", "click_rate", "bounce_rate", "unsub_rate"] },
  ],
  opportunitySections: [
    { key: "growth_opps", label: "Growth Opportunities", metrics: ["leads_new", "customers_new", "emails_sent", "automation_executions"] },
  ],
  forecastDetail: [
    { from: "spark_lead_sources", id: "spark_lead_sources_fc", section: "forecast.pipeline_trajectory", label: "Lead Source Trajectory — 3-month projection" },
    { from: "spark_contact_sources", id: "spark_contact_sources_fc", section: "forecast.list_trajectory", label: "Contact Source Trajectory" },
  ],
  anomalyDetail: [
    { from: "spark_lead_sources", id: "spark_lead_sources_anom", section: "anomaly.pipeline_anomalies", label: "Lead Source Anomalies" },
    { from: "spark_bounce_domains", id: "spark_bounce_anom", section: "anomaly.engagement_anomalies", label: "Bounce Anomalies by Provider" },
  ],
  opportunityDetail: [
    { from: "spark_lead_sources", id: "spark_lead_sources_opp", section: "opportunity.growth_opps", label: "Lead Sources by Modelled Impact" },
    { from: "spark_automations", id: "spark_automations_opp", section: "opportunity.growth_opps", label: "Automations by Modelled Impact" },
  ],
};

export const OLIVER_MIRROR: MirrorConfig = {
  labels: {
    revenue_collected: "Revenue Collected", recurring_revenue: "Recurring Revenue", jobs_completed: "Jobs Completed",
    on_time_rate: "On-Time Rate", quotes_sent: "Quotes Sent", quotes_accepted: "Quotes Accepted",
    outstanding_ar: "Outstanding AR", avg_days_to_pay: "Days to Pay", crew_utilization: "Crew Utilization",
    reschedule_rate: "Reschedule Rate",
  },
  forecastSections: [
    { key: "revenue_trajectory", label: "Revenue Trajectory", metrics: [{ k: "revenue_collected" }, { k: "recurring_revenue" }, { k: "avg_days_to_pay", hib: false }] },
    { key: "operations_trajectory", label: "Operations Trajectory", metrics: [{ k: "jobs_completed" }, { k: "on_time_rate" }, { k: "crew_utilization" }] },
    { key: "pipeline_trajectory", label: "Sales Trajectory", metrics: [{ k: "quotes_sent" }, { k: "quotes_accepted" }] },
  ],
  anomalySections: [
    { key: "revenue_anomalies", label: "Revenue Anomalies", metrics: ["revenue_collected", "outstanding_ar"] },
    { key: "ops_anomalies", label: "Operations Anomalies", metrics: ["jobs_completed", "reschedule_rate", "crew_utilization"] },
  ],
  opportunitySections: [
    { key: "growth_opps", label: "Growth Opportunities", metrics: ["revenue_collected", "jobs_completed", "quotes_accepted", "recurring_revenue"] },
  ],
  forecastDetail: [
    { from: "oliver_revenue_by_service", id: "oliver_revenue_fc", section: "forecast.revenue_trajectory", label: "Revenue by Service — 3-month projection" },
    { from: "oliver_jobs_by_service", id: "oliver_jobs_fc", section: "forecast.operations_trajectory", label: "Jobs by Service Trajectory" },
  ],
  anomalyDetail: [
    { from: "oliver_revenue_by_service", id: "oliver_revenue_anom", section: "anomaly.revenue_anomalies", label: "Service Line Anomalies" },
    { from: "oliver_crew_performance", id: "oliver_crew_anom", section: "anomaly.ops_anomalies", label: "Crew Anomalies" },
  ],
  opportunityDetail: [
    { from: "oliver_revenue_by_service", id: "oliver_revenue_opp", section: "opportunity.growth_opps", label: "Service Lines by Modelled Impact" },
    { from: "oliver_top_customers", id: "oliver_customers_opp", section: "opportunity.growth_opps", label: "Customers by Modelled Impact" },
  ],
};

export const ARGUS_MIRROR: MirrorConfig = {
  labels: {
    journey_leads: "Leads", journey_customers: "New Customers", journey_revenue: "Attributed Revenue",
    journey_visits: "Website Visits", journey_impressions: "Total Impressions", platform_events: "Platform Events",
    integrations_healthy: "Healthy Integrations", automation_runs: "Automation Runs",
  },
  forecastSections: [
    { key: "funnel_trajectory", label: "Funnel Trajectory", metrics: [{ k: "journey_leads" }, { k: "journey_customers" }, { k: "journey_revenue" }] },
    { key: "reach_trajectory", label: "Reach Trajectory", metrics: [{ k: "journey_impressions" }, { k: "journey_visits" }] },
  ],
  anomalySections: [
    { key: "funnel_anomalies", label: "Funnel Anomalies", metrics: ["journey_impressions", "journey_visits", "journey_leads", "journey_customers"] },
    { key: "platform_anomalies", label: "Platform Anomalies", metrics: ["platform_events", "integrations_healthy"] },
  ],
  opportunitySections: [
    { key: "journey_opps", label: "Journey Opportunities", metrics: ["journey_impressions", "journey_visits", "journey_leads", "journey_customers"] },
  ],
  forecastDetail: [
    { from: "argus_leads_by_source", id: "argus_leads_fc", section: "forecast.funnel_trajectory", label: "Lead Sources — 3-month projection" },
    { from: "argus_revenue_by_source", id: "argus_revenue_fc", section: "forecast.funnel_trajectory", label: "Revenue by Source Trajectory" },
  ],
  anomalyDetail: [
    { from: "argus_impressions_by_channel", id: "argus_impr_anom", section: "anomaly.funnel_anomalies", label: "Channel Anomalies" },
    { from: "argus_events_by_product", id: "argus_events_anom", section: "anomaly.platform_anomalies", label: "Event Flow Anomalies by Product" },
  ],
  opportunityDetail: [
    { from: "argus_revenue_by_source", id: "argus_revenue_opp", section: "opportunity.journey_opps", label: "Revenue Sources by Modelled Impact" },
  ],
};
