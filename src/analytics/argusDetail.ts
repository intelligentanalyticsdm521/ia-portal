// argusDetail.ts — ARGUS cross-platform dimensioned detail reports.
//
// The line items under the cross-platform journey: which channel produced the
// impressions, which source produced the leads and the revenue, which product
// fired the events, which integration went quiet. Client-generated demo until
// the ARGUS metrics endpoint ships.

import { genSeries } from "./demoSeries";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";

const mom = (s: number[]) => {
  const c = s[s.length - 1], p = s[s.length - 2];
  return p ? ((c - p) / Math.abs(p)) * 100 : null;
};

export function demoArgusDetail(seed: string): DetailPayload {
  const reports: DetailPayload = {};
  const add = (id: string, meta: Omit<DetailReport, "id" | "items">, items: DetailItem[]) => {
    for (const it of items) if (it.series?.length >= 2) it.momPct = mom(it.series as number[]);
    reports[id] = { id, ...meta, items };
  };
  const S = (salt: string, base: number, spec: Record<string, unknown> = {}) =>
    genSeries(`${seed}:argusd:${salt}`, { base, ...spec } as any);

  add("argus_impressions_by_channel", {
    section: "customer_journey.top_funnel", label: "Impressions by Channel",
    itemLabel: "Channel", primaryLabel: "Impressions", format: "number", higherIsBetter: true,
  }, [
    { name: "Google Search (website)", series: S("i0", 3400, { drift: 0.03, dir: 1, integer: true, noise: 0.08 }) },
    { name: "Google Business Profile", series: S("i1", 5200, { drift: 0.025, dir: 1, integer: true, noise: 0.08 }) },
    { name: "Social", series: S("i2", 900, { drift: 0.01, dir: -1, integer: true, noise: 0.2 }) },
    { name: "Bing", series: S("i3", 420, { drift: 0.02, integer: true, noise: 0.15 }) },
  ]);

  add("argus_leads_by_source", {
    section: "customer_journey.mid_funnel", label: "Leads by Source",
    itemLabel: "Source", primaryLabel: "Leads", format: "count", higherIsBetter: true,
    columns: [{ key: "toCustomer", label: "→ Customer %", format: "percent" }],
  }, [
    { name: "Organic Search", series: S("l0", 24, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }), extra: { toCustomer: 15 } },
    { name: "Google Business Profile", series: S("l1", 18, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }), extra: { toCustomer: 19 } },
    { name: "Referral", series: S("l2", 9, { drift: 0.02, integer: true, noise: 0.2 }), extra: { toCustomer: 24 } },
    { name: "Paid", series: S("l3", 8, { drift: 0.005, dir: -1, integer: true, noise: 0.25 }), extra: { toCustomer: 8 } },
    { name: "Social", series: S("l4", 4, { drift: 0.01, integer: true, noise: 0.3 }), extra: { toCustomer: 5 } },
  ]);

  add("argus_revenue_by_source", {
    section: "customer_journey.bottom_funnel", label: "Attributed Revenue by Source",
    itemLabel: "Source", primaryLabel: "Revenue", format: "currency", higherIsBetter: true,
  }, [
    { name: "Organic Search", series: S("r0", 8200, { drift: 0.03, dir: 1, integer: true, noise: 0.12 }) },
    { name: "Google Business Profile", series: S("r1", 6400, { drift: 0.03, dir: 1, integer: true, noise: 0.12 }) },
    { name: "Referral", series: S("r2", 3800, { drift: 0.02, integer: true, noise: 0.15 }) },
    { name: "Paid", series: S("r3", 1900, { drift: 0.005, dir: -1, integer: true, noise: 0.2 }) },
    { name: "Repeat / direct", series: S("r4", 5100, { drift: 0.02, dir: 1, integer: true, noise: 0.1 }) },
  ]);

  add("argus_events_by_product", {
    section: "automation_data.events", label: "Platform Events by Product",
    itemLabel: "Product", primaryLabel: "Events", format: "number", higherIsBetter: true,
  }, [
    { name: "SPARK (contacts, campaigns)", series: S("e0", 2100, { drift: 0.03, dir: 1, integer: true, noise: 0.1 }) },
    { name: "OLIVER (jobs, invoices)", series: S("e1", 1700, { drift: 0.03, dir: 1, integer: true, noise: 0.1 }) },
    { name: "ARION (forms, site)", series: S("e2", 980, { drift: 0.02, integer: true, noise: 0.12 }) },
  ]);

  add("argus_integrations", {
    section: "automation_data.connectivity", label: "Integration Health", kind: "feed",
    itemLabel: "Integration", format: "number", higherIsBetter: true,
    columns: [
      { key: "status", label: "Status", format: "text" },
      { key: "lastSync", label: "Last sync", format: "text" },
      { key: "records", label: "Records (30d)", format: "number" },
    ],
  }, [
    { name: "Google Analytics 4", series: [], extra: { status: "Healthy", lastSync: "2h ago", records: 8400 } },
    { name: "Google Search Console", series: [], extra: { status: "Healthy", lastSync: "6h ago", records: 3900 } },
    { name: "Google Business Profile", series: [], extra: { status: "Healthy", lastSync: "1h ago", records: 720 } },
    { name: "Stripe", series: [], extra: { status: "Healthy", lastSync: "20m ago", records: 210 } },
    { name: "IA Plugin", series: [], extra: { status: "Degraded — last report 3d ago", lastSync: "3d ago", records: 48 } },
    { name: "SE Ranking", series: [], extra: { status: "Healthy", lastSync: "12h ago", records: 1620 } },
  ]);

  return reports;
}
