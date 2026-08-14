// oliverDetail.ts — OLIVER dimensioned detail reports (line items, each trended).
//
// Which service line, which aging bucket, which crew, which customer — the
// operational depth under OLIVER's sections. Client-generated demo until the
// OLIVER metrics endpoint ships.

import { genSeries } from "./demoSeries";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";

const mom = (s: number[]) => {
  const c = s[s.length - 1], p = s[s.length - 2];
  return p ? ((c - p) / Math.abs(p)) * 100 : null;
};

export function demoOliverDetail(seed: string): DetailPayload {
  const reports: DetailPayload = {};
  const add = (id: string, meta: Omit<DetailReport, "id" | "items">, items: DetailItem[]) => {
    for (const it of items) if (it.series?.length >= 2) it.momPct = mom(it.series as number[]);
    reports[id] = { id, ...meta, items };
  };
  const S = (salt: string, base: number, spec: Record<string, unknown> = {}) =>
    genSeries(`${seed}:oliverd:${salt}`, { base, ...spec } as any);

  const SERVICES = ["Recurring Maintenance", "One-time Projects", "Repairs", "Seasonal Services", "Materials & Add-ons"];

  add("oliver_revenue_by_service", {
    section: "revenue_cash.revenue", label: "Revenue by Service Line",
    itemLabel: "Service", primaryLabel: "Revenue", format: "currency", higherIsBetter: true,
  }, SERVICES.map((n, i) => ({
    name: n, series: S(`rev${i}`, [16800, 11200, 6400, 5200, 2400][i], { drift: 0.025, dir: i === 0 ? 1 : i === 2 ? -1 : 0, noise: 0.12, integer: true }),
  })));

  add("oliver_invoice_aging", {
    section: "revenue_cash.collections", label: "Receivables Aging",
    itemLabel: "Bucket", primaryLabel: "Outstanding", format: "currency", higherIsBetter: false,
  }, [
    { name: "Current (not due)", series: S("ag0", 5200, { drift: 0.02, integer: true, noise: 0.1 }) },
    { name: "1–30 days overdue", series: S("ag1", 2800, { drift: 0.005, integer: true, noise: 0.15, dir: 1 }) },
    { name: "31–60 days", series: S("ag2", 1200, { drift: -0.005, integer: true, noise: 0.2 }) },
    { name: "61–90 days", series: S("ag3", 520, { drift: -0.01, integer: true, noise: 0.25 }) },
    { name: "90+ days", series: S("ag4", 380, { drift: -0.005, integer: true, noise: 0.25, dir: 1 }) },
  ]);

  add("oliver_overdue_invoices", {
    section: "revenue_cash.collections", label: "Invoices Needing a Chase", kind: "feed",
    itemLabel: "Invoice", format: "currency", higherIsBetter: false,
    columns: [
      { key: "customer", label: "Customer", format: "text" },
      { key: "amount", label: "Amount", format: "currency" },
      { key: "overdue", label: "Days overdue", format: "number" },
    ],
  }, [
    { name: "INV-2087", series: [], extra: { customer: "Rasmussen Property Mgmt", amount: 1840, overdue: 94 } },
    { name: "INV-2103", series: [], extra: { customer: "Whitfield HOA", amount: 1260, overdue: 61 } },
    { name: "INV-2131", series: [], extra: { customer: "Sandoval Rentals", amount: 940, overdue: 42 } },
    { name: "INV-2140", series: [], extra: { customer: "Thorne Commercial", amount: 720, overdue: 35 } },
    { name: "INV-2149", series: [], extra: { customer: "Gallagher Residence", amount: 410, overdue: 18 } },
  ]);

  add("oliver_invoice_size", {
    section: "revenue_cash.deal_size", label: "Invoices by Size",
    itemLabel: "Size band", primaryLabel: "Invoices", format: "count", higherIsBetter: true,
  }, [
    { name: "Under $250", series: S("sz0", 34, { drift: 0.01, integer: true, noise: 0.1 }) },
    { name: "$250 – $500", series: S("sz1", 28, { drift: 0.015, integer: true, noise: 0.1 }) },
    { name: "$500 – $1,000", series: S("sz2", 17, { drift: 0.02, dir: 1, integer: true, noise: 0.12 }) },
    { name: "$1,000+", series: S("sz3", 9, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }) },
  ]);

  add("oliver_jobs_by_service", {
    section: "jobs_operations.throughput", label: "Jobs by Service Line",
    itemLabel: "Service", primaryLabel: "Jobs", format: "count", higherIsBetter: true,
  }, SERVICES.map((n, i) => ({
    name: n, series: S(`job${i}`, [58, 26, 18, 12, 8][i], { drift: 0.02, dir: i === 0 ? 1 : 0, integer: true, noise: 0.12 }),
  })));

  add("oliver_reschedule_reasons", {
    section: "jobs_operations.reliability", label: "Reschedules by Reason", kind: "feed",
    itemLabel: "Reason", format: "count", higherIsBetter: false,
    columns: [{ key: "count", label: "This month", format: "number" }, { key: "prev", label: "Last month", format: "number" }],
  }, [
    { name: "Weather", series: [], extra: { count: 6, prev: 4 } },
    { name: "Customer request", series: [], extra: { count: 4, prev: 5 } },
    { name: "Crew availability", series: [], extra: { count: 3, prev: 5 } },
    { name: "Equipment issue", series: [], extra: { count: 1, prev: 2 } },
  ]);

  add("oliver_backlog_age", {
    section: "jobs_operations.backlog", label: "Open Jobs by Age",
    itemLabel: "Age band", primaryLabel: "Jobs", format: "count", higherIsBetter: false,
  }, [
    { name: "Booked 0–7 days out", series: S("bk0", 11, { drift: 0.01, integer: true, noise: 0.15 }) },
    { name: "8–14 days out", series: S("bk1", 7, { drift: 0.01, integer: true, noise: 0.2 }) },
    { name: "15–30 days out", series: S("bk2", 4, { drift: 0.02, dir: 1, integer: true, noise: 0.25 }) },
    { name: "Waiting 30+ days (stale)", series: S("bk3", 2, { drift: -0.02, integer: true, noise: 0.3, min: 0 }) },
  ]);

  add("oliver_pending_quotes", {
    section: "sales_pipeline.quoting", label: "Quotes Awaiting a Response", kind: "feed",
    itemLabel: "Quote", format: "currency", higherIsBetter: false,
    columns: [
      { key: "customer", label: "Customer", format: "text" },
      { key: "value", label: "Value", format: "currency" },
      { key: "waiting", label: "Days waiting", format: "number" },
    ],
  }, [
    { name: "Q-2214", series: [], extra: { customer: "Keating Estates", value: 2400, waiting: 12 } },
    { name: "Q-2221", series: [], extra: { customer: "Marsh Residence", value: 1150, waiting: 8 } },
    { name: "Q-2228", series: [], extra: { customer: "Novak Commercial", value: 3600, waiting: 6 } },
    { name: "Q-2233", series: [], extra: { customer: "Pratt Residence", value: 480, waiting: 3 } },
    { name: "Q-2236", series: [], extra: { customer: "Ellison HOA", value: 5200, waiting: 1 } },
  ]);

  add("oliver_quotes_by_service", {
    section: "sales_pipeline.winning", label: "Quote Win Rate by Service",
    itemLabel: "Service", primaryLabel: "Quotes Sent", format: "count", higherIsBetter: true,
    columns: [{ key: "winRate", label: "Win %", format: "percent" }, { key: "avgValue", label: "Avg Value", format: "currency" }],
  }, SERVICES.slice(0, 4).map((n, i) => ({
    name: n, series: S(`q${i}`, [16, 14, 9, 7][i], { drift: 0.02, dir: i === 1 ? 1 : 0, integer: true, noise: 0.18 }),
    extra: { winRate: [52, 34, 46, 38][i], avgValue: [420, 1650, 380, 720][i] },
  })));

  add("oliver_quote_size", {
    section: "sales_pipeline.quote_value", label: "Quotes by Size",
    itemLabel: "Size band", primaryLabel: "Quotes", format: "count", higherIsBetter: true,
    columns: [{ key: "winRate", label: "Win %", format: "percent" }],
  }, [
    { name: "Under $500", series: S("qs0", 18, { drift: 0.01, integer: true, noise: 0.15 }), extra: { winRate: 54 } },
    { name: "$500 – $1,500", series: S("qs1", 14, { drift: 0.02, dir: 1, integer: true, noise: 0.15 }), extra: { winRate: 41 } },
    { name: "$1,500 – $5,000", series: S("qs2", 8, { drift: 0.025, dir: 1, integer: true, noise: 0.2 }), extra: { winRate: 32 } },
    { name: "$5,000+", series: S("qs3", 3, { drift: 0.03, integer: true, noise: 0.3 }), extra: { winRate: 21 } },
  ]);

  add("oliver_crew_performance", {
    section: "crew_capacity.utilization", label: "Crew Performance",
    itemLabel: "Crew", primaryLabel: "Utilization", format: "percent", higherIsBetter: true,
    columns: [{ key: "jobs", label: "Jobs", format: "number" }, { key: "onTime", label: "On-time %", format: "percent" }],
  }, [
    { name: "Crew A", series: S("cr0", 82, { drift: 0.004, dir: 1, noise: 0.04, max: 100 }), extra: { jobs: 46, onTime: 94 } },
    { name: "Crew B", series: S("cr1", 74, { drift: 0.006, noise: 0.05, max: 100 }), extra: { jobs: 41, onTime: 88 } },
    { name: "Crew C", series: S("cr2", 63, { drift: 0.01, dir: -1, noise: 0.06, max: 100 }), extra: { jobs: 31, onTime: 81 } },
  ]);

  add("oliver_booked_ahead", {
    section: "crew_capacity.capacity", label: "Bookings by Week Out",
    itemLabel: "Window", primaryLabel: "Jobs Booked", format: "count", higherIsBetter: true,
  }, [
    { name: "This week", series: S("ba0", 28, { drift: 0.01, integer: true, noise: 0.1 }) },
    { name: "Next week", series: S("ba1", 21, { drift: 0.015, dir: 1, integer: true, noise: 0.12 }) },
    { name: "2–3 weeks out", series: S("ba2", 14, { drift: 0.02, dir: 1, integer: true, noise: 0.15 }) },
    { name: "4+ weeks out", series: S("ba3", 6, { drift: 0.03, integer: true, noise: 0.25 }) },
  ]);

  add("oliver_recurring_contracts", {
    section: "customer_retention.recurring", label: "Recurring Contracts",
    itemLabel: "Contract", primaryLabel: "Monthly Value", format: "currency", higherIsBetter: true,
    columns: [{ key: "cadence", label: "Cadence", format: "text" }, { key: "since", label: "Since", format: "text" }],
  }, [
    { name: "Whitfield HOA — grounds", series: S("rc0", 1800, { drift: 0.01, integer: true, noise: 0.05 }), extra: { cadence: "Weekly", since: "2022" } },
    { name: "Rasmussen PM — 12 properties", series: S("rc1", 1450, { drift: 0.02, dir: 1, integer: true, noise: 0.06 }), extra: { cadence: "Weekly", since: "2023" } },
    { name: "Thorne Commercial — campus", series: S("rc2", 1100, { drift: 0.005, integer: true, noise: 0.06 }), extra: { cadence: "Bi-weekly", since: "2021" } },
    { name: "Keating Estates — seasonal", series: S("rc3", 640, { drift: 0.03, dir: 1, integer: true, noise: 0.1 }), extra: { cadence: "Monthly", since: "2025" } },
    { name: "Sandoval Rentals — 6 units", series: S("rc4", 520, { drift: -0.01, dir: -1, integer: true, noise: 0.1 }), extra: { cadence: "Bi-weekly", since: "2022" } },
  ]);

  add("oliver_top_customers", {
    section: "customer_retention.loyalty", label: "Top Customers by Revenue",
    itemLabel: "Customer", primaryLabel: "Monthly Revenue", format: "currency", higherIsBetter: true,
    columns: [{ key: "ltv", label: "LTV", format: "currency" }, { key: "since", label: "Customer since", format: "text" }],
  }, [
    { name: "Whitfield HOA", series: S("tc0", 2400, { drift: 0.01, integer: true, noise: 0.08 }), extra: { ltv: 41000, since: "2022" } },
    { name: "Rasmussen Property Mgmt", series: S("tc1", 1900, { drift: 0.02, dir: 1, integer: true, noise: 0.1 }), extra: { ltv: 28500, since: "2023" } },
    { name: "Thorne Commercial", series: S("tc2", 1450, { drift: 0.005, integer: true, noise: 0.1 }), extra: { ltv: 22100, since: "2021" } },
    { name: "Sandoval Rentals", series: S("tc3", 980, { drift: -0.01, dir: -1, integer: true, noise: 0.12 }), extra: { ltv: 16800, since: "2022" } },
    { name: "Keating Estates", series: S("tc4", 760, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }), extra: { ltv: 9400, since: "2025" } },
  ]);

  return reports;
}
