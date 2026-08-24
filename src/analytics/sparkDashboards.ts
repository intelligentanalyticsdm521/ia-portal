// sparkDashboards.ts — SPARK (CRM / marketing) Trends catalog.
//
// Five dashboards along SPARK's job: capture leads → nurture → convert, plus
// the deliverability + automation health that keep it running. Same model as
// ARION. Benchmarks use published email-marketing figures (see model-review
// doc for sources). Demo series client-generated until the SPARK metrics
// endpoint ships.

import { met, buildDashboards, type DashboardDef } from "./catalog";
import { buildDemoPayload, type SeriesSpec } from "./demoSeries";
import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore } from "./scoring";

export const SPARK_DASHBOARDS: DashboardDef[] = [
  {
    key: "contact_health", label: "Contact Health",
    question: "Is my list growing, reachable, and clean?",
    sections: [
      { key: "growth", label: "List Growth", weight: 0.4, metrics: [
        met("contacts_total", "Total Contacts", "number", "line", true, 0.4, "The size of your marketable audience."),
        met("contacts_new", "New Contacts", "count", "line", true, 0.4, "Contacts added this month — new demand entering your list.", undefined, 5),
        met("contacts_active", "Active Contacts", "number", "line", true, 0.2, "Contacts who engaged in the last 90 days."),
      ]},
      { key: "reachability", label: "Reachability", weight: 0.35, metrics: [
        met("email_coverage", "Email Coverage", "percent", "gauge", true, 0.5, "Share of contacts you can email.", { value: 90, kind: "cohort" }),
        met("phone_coverage", "Phone Coverage", "percent", "gauge", true, 0.3, "Share with a phone number for SMS or calls.", { value: 60, kind: "cohort" }),
        met("active_ratio", "Active Ratio", "percent", "gauge", true, 0.2, "Share of the list that is actually engaged.", { value: 40, kind: "cohort" }),
      ]},
      { key: "hygiene", label: "List Hygiene", weight: 0.25, metrics: [
        met("optout_rate", "Opt-Out Rate", "percent", "gauge", false, 0.5, "Share of the list that has unsubscribed or opted out.", { value: 2, kind: "cohort" }),
        met("stale_ratio", "Dormant Contacts", "percent", "donut", false, 0.5, "Share with no engagement in 6+ months.", { value: 30, kind: "cohort" }),
      ]},
    ],
  },
  {
    key: "lead_pipeline", label: "Lead Pipeline",
    question: "Are leads coming in and converting?",
    sections: [
      { key: "inflow", label: "Lead Inflow", weight: 0.30, metrics: [
        met("leads_new", "New Leads", "count", "line", true, 0.6, "Fresh leads captured this month.", undefined, 3),
        met("leads_sources", "Active Lead Sources", "count", "bar", true, 0.4, "Distinct sources bringing leads in.", undefined, 1),
      ]},
      { key: "progression", label: "Progression", weight: 0.30, metrics: [
        met("leads_qualified", "Qualified Leads", "count", "line", true, 0.5, "Leads that reached a qualified stage.", undefined, 2),
        met("pipeline_velocity", "Pipeline Velocity", "number", "line", false, 0.5, "Average days from lead to customer; lower is better."),
      ]},
      { key: "conversion", label: "Conversion", weight: 0.25, metrics: [
        met("lead_conversion_rate", "Lead → Customer Rate", "percent", "gauge", true, 0.6, "Share of leads that became paying customers.", { value: 10, kind: "cohort" }),
        met("customers_new", "New Customers", "count", "line", true, 0.4, "Leads that converted this month.", undefined, 2),
      ]},
      // Sept-A F5 — Attribution moved into the reports system (the standalone
      // SPARK page is retired). The four model reports (first/last/linear/
      // u-shaped) group under this section in the catalog; these two metrics
      // are the scoring feed so the section moves the Trend score instead of
      // being detail that feeds nothing (the Aug-20 rework's lesson).
      { key: "attribution", label: "Attribution", weight: 0.15, metrics: [
        met("attributed_conversions", "Tracked Conversions", "count", "line", true, 0.6, "Won deals whose customer journey was tracked — conversions your marketing can explain.", undefined, 1),
        met("attribution_channels", "Credited Channels", "count", "bar", true, 0.4, "Distinct marketing channels earning conversion credit this month.", undefined, 1),
      ]},
    ],
  },
  {
    key: "campaign_performance", label: "Campaign Performance",
    question: "Are my emails landing and getting engagement?",
    sections: [
      { key: "reach", label: "Send Volume", weight: 0.25, metrics: [
        met("emails_sent", "Emails Sent", "number", "line", true, 0.6, "Total emails delivered this month."),
        met("campaigns_run", "Campaigns Run", "count", "bar", true, 0.4, "Distinct campaigns sent.", undefined, 1),
      ]},
      { key: "opens", label: "Open Performance", weight: 0.4, metrics: [
        met("open_rate", "Open Rate", "percent", "gauge", true, 0.6, "Share of delivered emails that were opened.", { value: 21, kind: "cohort" }),
        met("unique_opens", "Unique Opens", "number", "line", true, 0.4, "Distinct people who opened."),
      ]},
      { key: "clicks", label: "Click Performance", weight: 0.35, metrics: [
        met("click_rate", "Click Rate", "percent", "gauge", true, 0.5, "Share of delivered emails that were clicked.", { value: 2.6, kind: "cohort" }),
        met("click_to_open", "Click-to-Open Rate", "percent", "gauge", true, 0.5, "Of those who opened, how many clicked — measures message quality.", { value: 10, kind: "cohort" }),
      ]},
    ],
  },
  {
    key: "deliverability", label: "Deliverability",
    question: "Is my mail reaching the inbox safely?",
    sections: [
      { key: "delivery", label: "Delivery Health", weight: 0.5, metrics: [
        met("bounce_rate", "Bounce Rate", "percent", "gauge", false, 0.6, "Share of emails that couldn't be delivered.", { value: 2, kind: "absolute" }),
        met("delivery_rate", "Delivery Rate", "percent", "gauge", true, 0.4, "Share of emails accepted by the inbox provider.", { value: 98, kind: "absolute" }),
      ]},
      { key: "reputation", label: "Sender Reputation", weight: 0.5, metrics: [
        met("complaint_rate", "Complaint Rate", "percent", "gauge", false, 0.5, "Share marking you as spam — the fastest way to lose deliverability.", { value: 0.1, kind: "absolute" }),
        met("unsub_rate", "Unsubscribe Rate", "percent", "gauge", false, 0.5, "Share unsubscribing per send.", { value: 0.5, kind: "absolute" }),
      ]},
    ],
  },
  {
    key: "automation_retention", label: "Automation & Retention",
    question: "Are automations working and customers staying?",
    sections: [
      { key: "automation", label: "Automation", weight: 0.5, metrics: [
        met("automations_active", "Active Automations", "count", "bar", true, 0.4, "Automated flows currently running.", undefined, 1),
        met("automation_executions", "Executions", "number", "line", true, 0.3, "Times your automations fired this month."),
        met("automation_conversion", "Automation Conversion", "percent", "gauge", true, 0.3, "Share of automation touches that led to a goal.", { value: 8, kind: "cohort" }),
      ]},
      { key: "retention", label: "Retention", weight: 0.5, metrics: [
        met("retention_high", "Healthy Contacts", "percent", "gauge", true, 0.5, "Share of contacts scored as healthy/engaged.", { value: 40, kind: "cohort" }),
        met("retention_at_risk", "At-Risk Contacts", "percent", "gauge", false, 0.5, "Share cooling off and likely to lapse.", { value: 25, kind: "cohort" }),
      ]},
    ],
  },
];

function unmeasuredForSpark(): { reason: string; kind: "connect" | "plan" } {
  return { reason: "Add contacts and send a campaign to populate SPARK insights.", kind: "connect" };
}

export function buildSparkDashboards(payload: MetricsPayload): DashboardScore[] {
  return buildDashboards(SPARK_DASHBOARDS, payload, unmeasuredForSpark);
}

/** Deterministic demo series per tenant (until the SPARK metrics endpoint ships). */
export function demoSparkMetrics(seed: string): MetricsPayload {
  const specs: Record<string, SeriesSpec> = {
    contacts_total:   { base: 1200, drift: 0.03, dir: 1, integer: true },
    contacts_new:     { base: 48, drift: 0.02, dir: 1, integer: true, noise: 0.2 },
    contacts_active:  { base: 520, drift: 0.02, integer: true },
    phone_coverage:   { base: 58, drift: 0.004, noise: 0.03, max: 100 },
    optout_rate:      { base: 1.8, drift: 0.005, noise: 0.1, dir: 1 },
    stale_ratio:      { base: 28, drift: -0.004, noise: 0.05, max: 100 },
    leads_new:        { base: 62, drift: 0.03, dir: 1, integer: true, noise: 0.18 },
    leads_sources:    { base: 5, drift: 0.01, noise: 0.1, integer: true },
    leads_qualified:  { base: 28, drift: 0.03, dir: 1, integer: true, noise: 0.15 },
    pipeline_velocity:{ base: 18, drift: -0.01, noise: 0.06 },
    customers_new:    { base: 9, drift: 0.03, dir: 1, integer: true, noise: 0.2 },
    emails_sent:      { base: 4200, drift: 0.02, integer: true, noise: 0.1 },
    campaigns_run:    { base: 4, drift: 0.01, noise: 0.15, integer: true },
    unique_opens:     { base: 880, drift: 0.02, dir: 1, integer: true },
    open_rate:        { base: 22, drift: 0.004, noise: 0.05, dir: 1, max: 100 },
    click_rate:       { base: 2.8, drift: 0.006, noise: 0.08, dir: -1 },
    click_to_open:    { base: 12, drift: 0.004, noise: 0.06, max: 100 },
    bounce_rate:      { base: 1.6, drift: -0.005, noise: 0.12 },
    delivery_rate:    { base: 97.8, drift: 0.001, noise: 0.005, max: 100 },
    complaint_rate:   { base: 0.08, drift: 0.002, noise: 0.2 },
    unsub_rate:       { base: 0.42, drift: 0.003, noise: 0.15, dir: 1 },
    automations_active:{ base: 6, drift: 0.02, noise: 0.08, integer: true },
    automation_executions:{ base: 340, drift: 0.03, dir: 1, integer: true },
    automation_conversion:{ base: 9, drift: 0.006, noise: 0.08, dir: 1 },
    retention_high:   { base: 42, drift: 0.005, noise: 0.04, max: 100 },
    retention_at_risk:{ base: 24, drift: -0.004, noise: 0.05, dir: 1, max: 100 },
    // Sept-A F5 — Attribution section demo feed.
    attributed_conversions:{ base: 7, drift: 0.03, dir: 1, integer: true, noise: 0.2 },
    attribution_channels:  { base: 4, drift: 0.01, noise: 0.12, integer: true },
  };
  return buildDemoPayload(`spark:${seed}`, specs, (M) => ({
    email_coverage:      M.contacts_total.map((t, i) => Number(Math.min(100, 88 + (i % 3)).toFixed(1))),
    active_ratio:        M.contacts_active.map((a, i) => Number(((a / M.contacts_total[i]) * 100).toFixed(1))),
    lead_conversion_rate:M.customers_new.map((c, i) => Number(((c / Math.max(1, M.leads_new[i])) * 100).toFixed(1))),
  }));
}
