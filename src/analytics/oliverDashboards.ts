// oliverDashboards.ts — OLIVER (field-service operations) Trends catalog.
//
// Five dashboards along OLIVER's job: quote → schedule → do the work → get paid
// → keep the customer. Same model as ARION. Currency metrics use the "currency"
// format. Demo series client-generated until the OLIVER metrics endpoint ships.

import { met, buildDashboards, type DashboardDef } from "./catalog";
import { buildDemoPayload, type SeriesSpec } from "./demoSeries";
import type { MetricsPayload } from "./arionDashboards";
import type { DashboardScore } from "./scoring";

export const OLIVER_DASHBOARDS: DashboardDef[] = [
  {
    key: "revenue_cash", label: "Revenue & Cash",
    question: "Is money coming in, and is it being collected?",
    sections: [
      { key: "revenue", label: "Revenue", weight: 0.45, metrics: [
        met("revenue_collected", "Revenue Collected", "currency", "line", true, 0.6, "Payments actually received this month."),
        met("revenue_invoiced", "Revenue Invoiced", "currency", "line", true, 0.4, "Total billed this month."),
      ]},
      { key: "collections", label: "Collections", weight: 0.35, metrics: [
        met("collection_rate", "Collection Rate", "percent", "gauge", true, 0.5, "Share of invoiced revenue that's been paid.", { value: 90, kind: "cohort" }),
        met("outstanding_ar", "Outstanding Receivables", "currency", "line", false, 0.3, "Money billed but not yet paid."),
        met("avg_days_to_pay", "Avg Days to Pay", "number", "line", false, 0.2, "How long invoices take to get paid.", { value: 30, kind: "cohort" }),
      ]},
      { key: "deal_size", label: "Deal Size", weight: 0.20, metrics: [
        met("avg_invoice", "Average Invoice", "currency", "line", true, 0.6, "Average value of an invoice."),
        met("revenue_per_customer", "Revenue / Customer", "currency", "line", true, 0.4, "Average revenue per active customer."),
      ]},
    ],
  },
  {
    key: "jobs_operations", label: "Jobs & Operations",
    question: "Is the work getting done, on time?",
    sections: [
      { key: "throughput", label: "Throughput", weight: 0.4, metrics: [
        met("jobs_completed", "Jobs Completed", "count", "line", true, 0.6, "Jobs finished this month.", undefined, 2),
        met("jobs_scheduled", "Jobs Scheduled", "count", "line", true, 0.4, "Jobs booked into the calendar.", undefined, 2),
      ]},
      { key: "reliability", label: "Reliability", weight: 0.4, metrics: [
        met("on_time_rate", "On-Time Rate", "percent", "gauge", true, 0.6, "Share of jobs completed on schedule — the failure a customer notices.", { value: 90, kind: "cohort" }),
        met("reschedule_rate", "Reschedule Rate", "percent", "gauge", false, 0.4, "Share of jobs pushed to another day.", { value: 10, kind: "cohort" }),
      ]},
      { key: "backlog", label: "Backlog", weight: 0.2, metrics: [
        met("open_jobs", "Open Jobs", "count", "line", false, 0.5, "Jobs booked but not yet done."),
        met("unassigned_jobs", "Unassigned Jobs", "count", "bar", false, 0.5, "Jobs with no crew assigned — a scheduling risk.", { value: 0, kind: "absolute" }),
      ]},
    ],
  },
  {
    key: "sales_pipeline", label: "Sales Pipeline",
    question: "Are quotes turning into work?",
    sections: [
      { key: "quoting", label: "Quoting", weight: 0.35, metrics: [
        met("quotes_sent", "Quotes Sent", "count", "line", true, 0.6, "Quotes issued this month.", undefined, 2),
        met("quote_response_time", "Quote Response Time", "number", "line", false, 0.4, "Hours to send a quote after a request; speed predicts winning.", { value: 24, kind: "cohort" }),
      ]},
      { key: "winning", label: "Win Rate", weight: 0.45, metrics: [
        met("quote_win_rate", "Quote Win Rate", "percent", "gauge", true, 0.6, "Share of quotes that became jobs.", { value: 40, kind: "cohort" }),
        met("quotes_accepted", "Quotes Accepted", "count", "line", true, 0.4, "Quotes that turned into work.", undefined, 1),
      ]},
      { key: "quote_value", label: "Quote Value", weight: 0.20, metrics: [
        met("avg_quote_value", "Average Quote Value", "currency", "line", true, 1.0, "Average value of a quote sent."),
      ]},
    ],
  },
  {
    key: "crew_capacity", label: "Crew & Capacity",
    question: "Is the team working efficiently, with room to grow?",
    sections: [
      { key: "utilization", label: "Utilization", weight: 0.5, metrics: [
        met("crew_utilization", "Crew Utilization", "percent", "gauge", true, 0.6, "Share of available crew hours booked with work.", { value: 75, kind: "cohort" }),
        met("jobs_per_crew", "Jobs per Crew", "number", "line", true, 0.4, "Average jobs completed per crew member."),
      ]},
      { key: "capacity", label: "Capacity", weight: 0.5, metrics: [
        met("booked_ahead_days", "Booked-Ahead Days", "number", "line", true, 0.5, "How far out the schedule is filled — demand health.", { value: 14, kind: "cohort" }),
        met("idle_capacity", "Idle Capacity", "percent", "gauge", false, 0.5, "Share of crew hours with no work.", { value: 20, kind: "cohort" }),
      ]},
    ],
  },
  {
    key: "customer_retention", label: "Customer Retention",
    question: "Are customers coming back?",
    sections: [
      { key: "recurring", label: "Recurring Revenue", weight: 0.45, metrics: [
        met("recurring_revenue", "Recurring Revenue", "currency", "line", true, 0.6, "Revenue from repeat and subscription customers."),
        met("recurring_share", "Recurring Share", "percent", "donut", true, 0.4, "Share of revenue that's recurring — the biggest driver of business value.", { value: 40, kind: "cohort" }),
      ]},
      { key: "loyalty", label: "Loyalty", weight: 0.55, metrics: [
        met("repeat_rate", "Repeat Customer Rate", "percent", "gauge", true, 0.5, "Share of customers who booked again.", { value: 50, kind: "cohort" }),
        met("churn_rate", "Churn Rate", "percent", "gauge", false, 0.3, "Share of recurring customers who lapsed.", { value: 8, kind: "cohort" }),
        met("customer_ltv", "Customer LTV", "currency", "line", true, 0.2, "Average lifetime value of a customer."),
      ]},
    ],
  },
];

function unmeasuredForOliver(): { reason: string; kind: "connect" | "plan" } {
  return { reason: "Create jobs, quotes and invoices to populate OLIVER insights.", kind: "connect" };
}

export function buildOliverDashboards(payload: MetricsPayload): DashboardScore[] {
  return buildDashboards(OLIVER_DASHBOARDS, payload, unmeasuredForOliver);
}

export function demoOliverMetrics(seed: string): MetricsPayload {
  const specs: Record<string, SeriesSpec> = {
    revenue_invoiced:   { base: 42000, drift: 0.03, dir: 1, noise: 0.1 },
    outstanding_ar:     { base: 9800, drift: 0.01, noise: 0.12, dir: 1 },
    avg_days_to_pay:    { base: 28, drift: 0.005, noise: 0.06, dir: 1 },
    avg_invoice:        { base: 640, drift: 0.01, noise: 0.05 },
    revenue_per_customer:{ base: 1150, drift: 0.01, noise: 0.05 },
    jobs_completed:     { base: 118, drift: 0.02, dir: 1, integer: true, noise: 0.12 },
    jobs_scheduled:     { base: 132, drift: 0.02, integer: true, noise: 0.1 },
    on_time_rate:       { base: 88, drift: 0.004, noise: 0.03, dir: -1, max: 100 },
    reschedule_rate:    { base: 11, drift: -0.004, noise: 0.08, max: 100 },
    open_jobs:          { base: 24, drift: 0.01, noise: 0.1, integer: true },
    unassigned_jobs:    { base: 3, drift: -0.02, noise: 0.3, integer: true, min: 0 },
    quotes_sent:        { base: 46, drift: 0.02, dir: 1, integer: true, noise: 0.15 },
    quote_response_time:{ base: 20, drift: -0.01, noise: 0.1 },
    quotes_accepted:    { base: 19, drift: 0.02, dir: 1, integer: true, noise: 0.15 },
    avg_quote_value:    { base: 720, drift: 0.01, noise: 0.06 },
    crew_utilization:   { base: 72, drift: 0.006, noise: 0.04, dir: 1, max: 100 },
    jobs_per_crew:      { base: 39, drift: 0.015, noise: 0.06 },
    booked_ahead_days:  { base: 12, drift: 0.01, noise: 0.1 },
    idle_capacity:      { base: 22, drift: -0.006, noise: 0.06, max: 100 },
    recurring_revenue:  { base: 15400, drift: 0.03, dir: 1, noise: 0.08 },
    repeat_rate:        { base: 48, drift: 0.006, noise: 0.04, dir: 1, max: 100 },
    churn_rate:         { base: 9, drift: -0.006, noise: 0.08, max: 100 },
    customer_ltv:       { base: 2400, drift: 0.01, noise: 0.04 },
  };
  return buildDemoPayload(`oliver:${seed}`, specs, (M) => ({
    revenue_collected: M.revenue_invoiced.map((v, i) => Math.round(v * (0.86 + (i % 4) * 0.02))),
    collection_rate:   M.revenue_invoiced.map((v, i) => Number((((v * (0.86 + (i % 4) * 0.02)) / v) * 100).toFixed(1))),
    quote_win_rate:    M.quotes_accepted.map((a, i) => Number(((a / Math.max(1, M.quotes_sent[i])) * 100).toFixed(1))),
    recurring_share:   M.recurring_revenue.map((r, i) => Number(((r / M.revenue_invoiced[i]) * 100).toFixed(1))),
  }));
}
