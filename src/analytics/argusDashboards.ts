// argusDashboards.ts — ARGUS Trends: cross-platform roll-up + its own.
//
// ARGUS is the layer above the products. Its Trends are:
//   1. Cross-Platform Performance — each product's overall trend as a section,
//      drilling into that product's dashboards. This is the roll-up that feeds
//      the Business Pulse.
//   2. Customer Journey — the funnel that spans products: found → visited →
//      enquired → won → paid → retained.
//   3. Automation & Data Health — the event bus and integration health that
//      keep the whole thing connected.
//
// (Future ARGUS enhancements — agents, chat analytics — get their own
// dashboards here as they ship; noted in the model-review doc.)

import { met, buildDashboards, type DashboardDef } from "./catalog";
import { buildDemoPayload, type SeriesSpec } from "./demoSeries";
import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore, SectionScore, DataPointScore } from "./scoring";
import { clamp } from "./scoring";

// ── ARGUS's own metric-driven dashboards ──
export const ARGUS_DASHBOARDS: DashboardDef[] = [
  {
    key: "customer_journey", label: "Customer Journey",
    question: "Is the whole funnel — from found to paid — healthy?",
    sections: [
      { key: "top_funnel", label: "Getting Found", weight: 0.3, metrics: [
        met("journey_impressions", "Total Impressions", "number", "line", true, 0.5, "Everywhere you appeared — search, maps, social."),
        met("journey_visits", "Website Visits", "number", "line", true, 0.5, "People who arrived on your site."),
      ]},
      { key: "mid_funnel", label: "Becoming Leads", weight: 0.35, metrics: [
        met("journey_leads", "Leads Captured", "count", "line", true, 0.5, "Visitors who became contacts.", undefined, 3),
        met("journey_visit_to_lead", "Visit → Lead Rate", "percent", "gauge", true, 0.5, "Share of visits that became a lead.", { value: 2.5, kind: "cohort" }),
      ]},
      { key: "bottom_funnel", label: "Becoming Revenue", weight: 0.35, metrics: [
        met("journey_customers", "New Customers", "count", "line", true, 0.4, "Leads that converted to paying customers.", undefined, 2),
        met("journey_lead_to_customer", "Lead → Customer Rate", "percent", "gauge", true, 0.35, "Share of leads that became customers.", { value: 10, kind: "cohort" }),
        met("journey_revenue", "Attributed Revenue", "currency", "line", true, 0.25, "Revenue traced back to the funnel."),
      ]},
    ],
  },
  {
    key: "automation_data", label: "Automation & Data Health",
    question: "Are the products connected and firing events?",
    sections: [
      { key: "events", label: "Event Flow", weight: 0.5, metrics: [
        met("platform_events", "Platform Events", "number", "line", true, 0.6, "Events flowing between products this month."),
        met("automation_runs", "Automation Runs", "number", "line", true, 0.4, "Cross-product automations that fired."),
      ]},
      { key: "connectivity", label: "Connectivity", weight: 0.5, metrics: [
        met("integrations_healthy", "Healthy Integrations", "percent", "gauge", true, 0.6, "Share of connected sources delivering data on schedule.", { value: 100, kind: "absolute" }),
        met("data_freshness", "Data Freshness", "percent", "gauge", true, 0.4, "Share of data sources refreshed in the expected window.", { value: 95, kind: "absolute" }),
      ]},
    ],
  },
];

function unmeasuredForArgus(): { reason: string; kind: "connect" | "plan" } {
  return { reason: "Connect more products so ARGUS can see across them.", kind: "connect" };
}

// ── Cross-platform dashboard, built from the other platforms' scores ──
export interface PlatformRollup {
  key: string;
  label: string;
  score: number | null;
  movementPct: number | null;
  /** the platform's own dashboards, shown as data points when you drill in */
  dashboards: DashboardScore[];
}

/**
 * Construct the Cross-Platform Performance dashboard directly (not via the
 * catalog): each platform is a section whose "data points" are that platform's
 * dashboards, so drilling in shows the product's own trend breakdown.
 */
export function crossPlatformDashboard(platforms: PlatformRollup[]): DashboardScore {
  const sections: SectionScore[] = platforms.map((pf): SectionScore => {
    const dataPoints: DataPointScore[] = pf.dashboards.map((d): DataPointScore => ({
      key: d.key, label: d.label, format: "score", visual: "stat",
      what: (d as any).question || "",
      series: [d.score ?? 0],
      current: d.score, priorMonth: d.priorScore,
      movementPct: d.movementPct, movementScore: 50,
      levelScore: d.score, levelKind: null,
      score: d.score ?? 0, weight: 1, higherIsBetter: true,
      unmeasured: d.score == null ? { reason: "Not connected", kind: "connect" } : undefined,
    }));
    return {
      key: pf.key, label: pf.label,
      score: pf.score, priorScore: null,
      movementPct: pf.movementPct,
      coverage: 100,
      dataPoints,
      weight: 1,
    };
  });
  const measured = sections.filter((s) => s.score != null);
  const score = measured.length ? clamp(Math.round(measured.reduce((s, x) => s + x.score!, 0) / measured.length)) : null;
  const movementPct = measured.filter((s) => s.movementPct != null).length
    ? measured.reduce((s, x) => s + (x.movementPct || 0), 0) / measured.filter((s) => s.movementPct != null).length
    : null;
  return {
    key: "cross_platform", label: "Cross-Platform Performance",
    score, priorScore: null, movementPct, coverage: 100, sections,
    ...( { question: "How is the business doing across every product?" } as any ),
  };
}

export function buildArgusDashboards(payload: MetricsPayload, platforms: PlatformRollup[]): DashboardScore[] {
  const own = buildDashboards(ARGUS_DASHBOARDS, payload, unmeasuredForArgus);
  return [crossPlatformDashboard(platforms), ...own];
}

export function demoArgusMetrics(seed: string): MetricsPayload {
  const specs: Record<string, SeriesSpec> = {
    journey_impressions:   { base: 9200, drift: 0.03, dir: 1, integer: true, noise: 0.1 },
    journey_visits:        { base: 2100, drift: 0.03, dir: 1, integer: true, noise: 0.1 },
    journey_leads:         { base: 62, drift: 0.03, dir: 1, integer: true, noise: 0.15 },
    journey_customers:     { base: 9, drift: 0.03, dir: 1, integer: true, noise: 0.2 },
    journey_revenue:       { base: 21000, drift: 0.03, dir: 1, noise: 0.1 },
    platform_events:       { base: 4800, drift: 0.03, dir: 1, integer: true, noise: 0.1 },
    automation_runs:       { base: 640, drift: 0.03, dir: 1, integer: true, noise: 0.12 },
    integrations_healthy:  { base: 94, drift: 0.003, noise: 0.02, max: 100 },
    data_freshness:        { base: 92, drift: 0.004, noise: 0.02, dir: 1, max: 100 },
  };
  return buildDemoPayload(`argus:${seed}`, specs, (M) => ({
    journey_visit_to_lead:     M.journey_leads.map((l, i) => Number(((l / Math.max(1, M.journey_visits[i])) * 100).toFixed(2))),
    journey_lead_to_customer:  M.journey_customers.map((c, i) => Number(((c / Math.max(1, M.journey_leads[i])) * 100).toFixed(1))),
  }));
}
