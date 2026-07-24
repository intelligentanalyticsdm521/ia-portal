// intelligenceBuilder.ts — generic Intelligence builder for any platform.
//
// The modeling engine (intelligence.ts) is metric-agnostic, so every platform's
// Intelligence is just a config: which metrics to forecast, which to scan for
// anomalies, which to rank for opportunity, plus labels and a revenue driver.
// ARION/SPARK/OLIVER/ARGUS each supply one config.

import type { MetricsPayload } from "./arionDashboards";
import { linearForecast, detectAnomaly, weightedImpact } from "./intelligence";
import type { ArionIntelligence, ForecastCard, AnomalyCard, OpportunityCard } from "./arionIntelligence";

export interface IntelligenceConfig {
  labels: Record<string, string>;
  forecast: string[];            // "search forecast" group
  forecastLowerBetter?: string[];// keys where lower is better (e.g. position, days-to-pay)
  secondaryForecast?: string[];  // "conversion forecast" group
  anomalyKeys: string[];
  opportunityKeys: string[];
  revenue?: { driverKey: string; perUnit: number; label: string };
}

function fmtNum(n: number): string {
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString() : n.toFixed(Math.abs(n) < 10 ? 1 : 0);
}

function forecastCard(key: string, label: string, series: Array<number | null>, lowerIsBetter: boolean): ForecastCard | null {
  const f = linearForecast(series, 3);
  if (!f) return null;
  const proj = f.projected[2];
  const good = lowerIsBetter ? f.direction === "falling" : f.direction === "rising";
  const dirWord = f.direction === "flat" ? "hold steady" : good ? "improve" : "decline";
  const headline = f.direction === "flat"
    ? `${label} is projected to hold near ${fmtNum(f.current)} over the next 3 months (${f.confidence} confidence).`
    : `${label} is on track to ${dirWord} to about ${fmtNum(proj)} within 3 months (${f.confidence} confidence).`;
  return { key, label, format: "number", forecast: f, headline };
}

export function buildIntelligence(payload: MetricsPayload, cfg: IntelligenceConfig): ArionIntelligence {
  const M = payload?.metrics || {};
  const has = (k: string) => Array.isArray(M[k]) && M[k].some((v) => v != null);
  const label = (k: string) => cfg.labels[k] || k;
  const lower = new Set(cfg.forecastLowerBetter || []);

  const searchForecast = cfg.forecast.filter(has)
    .map((k) => forecastCard(k, label(k), M[k], lower.has(k))).filter(Boolean) as ForecastCard[];
  const conversionForecast = (cfg.secondaryForecast || []).filter(has)
    .map((k) => forecastCard(k, label(k), M[k], lower.has(k))).filter(Boolean) as ForecastCard[];

  const anomalies: AnomalyCard[] = cfg.anomalyKeys.filter(has).map((k) => {
    const a = detectAnomaly(M[k]);
    if (!a || !a.isAnomaly) return null;
    const headline = `${label(k)} is running ${Math.abs(a.z).toFixed(1)} standard deviations ${a.direction} its normal range this month (${fmtNum(a.current)} vs typical ${fmtNum(a.baseline)}).`;
    return { key: k, label: label(k), anomaly: a, headline };
  }).filter(Boolean) as AnomalyCard[];

  const items = cfg.opportunityKeys.filter(has).map((k) => {
    const s = M[k].filter((v): v is number => v != null);
    if (s.length < 4) return null;
    const cur = s[s.length - 1], base = (s.slice(-4, -1).reduce((a, b) => a + b, 0) / 3) || 1;
    return { item: k, movementPct: ((cur - base) / Math.abs(base)) * 100, weightValue: cur };
  }).filter(Boolean) as Array<{ item: string; movementPct: number; weightValue: number }>;
  const { ranked } = weightedImpact(items);
  const opportunities: OpportunityCard[] = ranked.slice(0, 6).map((r) => {
    const up = r.movementPct >= 0;
    const headline = up
      ? `${label(r.item)} is gaining and carries real volume — protecting this momentum has the biggest modelled upside.`
      : `${label(r.item)} is slipping on high volume — recovering it is the single biggest lever available.`;
    return { key: r.item, label: label(r.item), movementPct: r.movementPct, weightValue: r.weightValue, impact: r.impact, headline };
  });

  let projectedRevenue: ArionIntelligence["projectedRevenue"] = null;
  if (cfg.revenue && has(cfg.revenue.driverKey)) {
    const f = linearForecast(M[cfg.revenue.driverKey], 3);
    if (f) projectedRevenue = {
      value: f.projected[2] * cfg.revenue.perUnit,
      low: f.bandLow[2] * cfg.revenue.perUnit,
      high: f.bandHigh[2] * cfg.revenue.perUnit,
      confidence: f.confidence,
    };
  }

  return { searchForecast, conversionForecast, anomalies, opportunities, projectedRevenue };
}

// ── Platform configs ──
export const SPARK_INTEL: IntelligenceConfig = {
  labels: {
    contacts_total: "Total Contacts", contacts_new: "New Contacts", leads_new: "New Leads",
    leads_qualified: "Qualified Leads", customers_new: "New Customers", open_rate: "Open Rate",
    click_rate: "Click Rate", emails_sent: "Emails Sent", bounce_rate: "Bounce Rate",
    unsub_rate: "Unsubscribe Rate", automation_executions: "Automation Runs", retention_high: "Healthy Contacts",
  },
  forecast: ["leads_new", "leads_qualified", "customers_new", "open_rate"],
  secondaryForecast: ["contacts_total", "click_rate", "emails_sent"],
  anomalyKeys: ["leads_new", "customers_new", "open_rate", "click_rate", "bounce_rate", "unsub_rate", "contacts_new"],
  opportunityKeys: ["leads_new", "leads_qualified", "customers_new", "emails_sent", "automation_executions"],
  revenue: { driverKey: "customers_new", perUnit: 900, label: "new customers" },
};

export const OLIVER_INTEL: IntelligenceConfig = {
  labels: {
    revenue_invoiced: "Revenue Invoiced", revenue_collected: "Revenue Collected", jobs_completed: "Jobs Completed",
    quotes_sent: "Quotes Sent", quotes_accepted: "Quotes Accepted", recurring_revenue: "Recurring Revenue",
    outstanding_ar: "Outstanding AR", avg_days_to_pay: "Days to Pay", on_time_rate: "On-Time Rate",
    crew_utilization: "Crew Utilization", customer_ltv: "Customer LTV",
  },
  forecast: ["revenue_collected", "jobs_completed", "recurring_revenue", "avg_days_to_pay"],
  forecastLowerBetter: ["avg_days_to_pay"],
  secondaryForecast: ["quotes_accepted", "crew_utilization"],
  anomalyKeys: ["revenue_collected", "jobs_completed", "quotes_sent", "on_time_rate", "outstanding_ar", "crew_utilization"],
  opportunityKeys: ["revenue_collected", "jobs_completed", "quotes_accepted", "recurring_revenue"],
  revenue: { driverKey: "revenue_collected", perUnit: 1, label: "collected revenue" },
};

export const ARGUS_INTEL: IntelligenceConfig = {
  labels: {
    journey_impressions: "Total Impressions", journey_visits: "Website Visits", journey_leads: "Leads",
    journey_customers: "New Customers", journey_revenue: "Attributed Revenue", platform_events: "Platform Events",
    automation_runs: "Automation Runs", integrations_healthy: "Healthy Integrations",
  },
  forecast: ["journey_leads", "journey_customers", "journey_revenue", "journey_visits"],
  secondaryForecast: ["journey_impressions", "platform_events"],
  anomalyKeys: ["journey_impressions", "journey_visits", "journey_leads", "journey_customers", "platform_events", "integrations_healthy"],
  opportunityKeys: ["journey_impressions", "journey_visits", "journey_leads", "journey_customers"],
  revenue: { driverKey: "journey_customers", perUnit: 950, label: "new customers" },
};
