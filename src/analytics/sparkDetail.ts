// sparkDetail.ts — SPARK dimensioned detail reports (line items, each trended).
//
// The layer under SPARK's sections: which contact source, which lead source,
// which campaign, which automation, which inbox domain — each with its own
// 12-month series, filed under its dashboard section. Client-generated demo
// until the SPARK metrics endpoint ships (same as its dashboard series).

import { genSeries } from "./demoSeries";
import type { DetailPayload, DetailReport, DetailItem } from "./detail";

const mom = (s: number[]) => {
  const c = s[s.length - 1], p = s[s.length - 2];
  return p ? ((c - p) / Math.abs(p)) * 100 : null;
};

export function demoSparkDetail(seed: string): DetailPayload {
  const reports: DetailPayload = {};
  const add = (id: string, meta: Omit<DetailReport, "id" | "items">, items: DetailItem[]) => {
    for (const it of items) if (it.series?.length >= 2) it.momPct = mom(it.series as number[]);
    reports[id] = { id, ...meta, items };
  };
  const S = (salt: string, base: number, spec: Record<string, unknown> = {}) =>
    genSeries(`${seed}:sparkd:${salt}`, { base, ...spec } as any);

  add("spark_contact_sources", {
    section: "contact_health.growth", label: "New Contacts by Source",
    itemLabel: "Source", primaryLabel: "Contacts", format: "count", higherIsBetter: true,
  }, [
    { name: "Website Form", series: S("cs0", 18, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }) },
    { name: "Google Ads", series: S("cs1", 11, { drift: 0.02, integer: true, noise: 0.2 }) },
    { name: "Referral", series: S("cs2", 8, { drift: 0.02, dir: 1, integer: true, noise: 0.2 }) },
    { name: "Facebook Lead Ad", series: S("cs3", 6, { drift: 0.01, dir: -1, integer: true, noise: 0.25 }) },
    { name: "Phone / Walk-in", series: S("cs4", 5, { integer: true, noise: 0.2 }) },
    { name: "Chat Widget", series: S("cs5", 3, { drift: 0.04, dir: 1, integer: true, noise: 0.3 }) },
  ]);

  add("spark_list_hygiene", {
    section: "contact_health.hygiene", label: "List Hygiene Breakdown",
    itemLabel: "Status", primaryLabel: "Contacts", format: "count", higherIsBetter: false,
  }, [
    { name: "Inactive 6 mo+", series: S("h0", 320, { drift: -0.004, integer: true, noise: 0.04, dir: 1 }) },
    { name: "Unsubscribed", series: S("h1", 78, { drift: 0.006, integer: true, noise: 0.06 }) },
    { name: "Hard bounced", series: S("h2", 34, { drift: -0.01, integer: true, noise: 0.1 }) },
    { name: "Duplicates", series: S("h3", 22, { drift: -0.02, integer: true, noise: 0.15, dir: -1 }) },
  ]);

  add("spark_field_coverage", {
    section: "contact_health.reachability", label: "Contact Data Coverage",
    itemLabel: "Field", primaryLabel: "Coverage", format: "percent", higherIsBetter: true,
    columns: [{ key: "missing", label: "Missing", format: "number" }],
  }, [
    { name: "Email address", series: S("fc0", 89, { drift: 0.003, noise: 0.01, max: 100 }), extra: { missing: 132 } },
    { name: "Phone number", series: S("fc1", 58, { drift: 0.006, dir: 1, noise: 0.02, max: 100 }), extra: { missing: 504 } },
    { name: "Full address", series: S("fc2", 44, { drift: 0.004, noise: 0.03, max: 100 }), extra: { missing: 672 } },
    { name: "Tags / segment", series: S("fc3", 61, { drift: 0.008, dir: 1, noise: 0.03, max: 100 }), extra: { missing: 468 } },
    { name: "Lead source", series: S("fc4", 72, { drift: 0.005, noise: 0.02, max: 100 }), extra: { missing: 336 } },
  ]);

  add("spark_lead_sources", {
    section: "lead_pipeline.inflow", label: "Leads by Source",
    itemLabel: "Source", primaryLabel: "Leads", format: "count", higherIsBetter: true,
    columns: [{ key: "convRate", label: "Conv %", format: "percent" }],
  }, [
    { name: "Organic Search", series: S("ls0", 22, { drift: 0.03, dir: 1, integer: true, noise: 0.15 }), extra: { convRate: 14 } },
    { name: "Google Business Profile", series: S("ls1", 15, { drift: 0.03, dir: 1, integer: true, noise: 0.18 }), extra: { convRate: 18 } },
    { name: "Google Ads", series: S("ls2", 12, { drift: 0.01, integer: true, noise: 0.2 }), extra: { convRate: 9 } },
    { name: "Referral", series: S("ls3", 8, { drift: 0.02, integer: true, noise: 0.2 }), extra: { convRate: 22 } },
    { name: "Social", series: S("ls4", 5, { drift: 0.01, dir: -1, integer: true, noise: 0.3 }), extra: { convRate: 5 } },
  ]);

  add("spark_stage_flow", {
    section: "lead_pipeline.progression", label: "Pipeline by Stage",
    itemLabel: "Stage", primaryLabel: "Leads", format: "count", higherIsBetter: true,
  }, [
    { name: "New", series: S("st0", 28, { drift: 0.02, dir: 1, integer: true, noise: 0.12 }) },
    { name: "Contacted", series: S("st1", 21, { drift: 0.02, integer: true, noise: 0.12 }) },
    { name: "Qualified", series: S("st2", 14, { drift: 0.025, dir: 1, integer: true, noise: 0.15 }) },
    { name: "Proposal", series: S("st3", 9, { drift: 0.02, integer: true, noise: 0.18 }) },
    { name: "Won", series: S("st4", 6, { drift: 0.03, dir: 1, integer: true, noise: 0.2 }) },
  ]);

  add("spark_conversion_by_source", {
    section: "lead_pipeline.conversion", label: "Customers Won by Source",
    itemLabel: "Source", primaryLabel: "Customers", format: "count", higherIsBetter: true,
    columns: [{ key: "convRate", label: "Lead → Cust %", format: "percent" }, { key: "avgDays", label: "Avg Days", format: "number" }],
  }, [
    { name: "Referral", series: S("cw0", 2.4, { drift: 0.03, dir: 1, integer: true, noise: 0.3 }), extra: { convRate: 24, avgDays: 9 } },
    { name: "Google Business Profile", series: S("cw1", 2.8, { drift: 0.03, dir: 1, integer: true, noise: 0.3 }), extra: { convRate: 19, avgDays: 14 } },
    { name: "Organic Search", series: S("cw2", 3.1, { drift: 0.03, integer: true, noise: 0.3 }), extra: { convRate: 14, avgDays: 18 } },
    { name: "Google Ads", series: S("cw3", 1.1, { drift: 0.01, dir: -1, integer: true, noise: 0.4 }), extra: { convRate: 9, avgDays: 22 } },
  ]);

  add("spark_sends_by_type", {
    section: "campaign_performance.reach", label: "Sends by Campaign Type",
    itemLabel: "Type", primaryLabel: "Emails Sent", format: "number", higherIsBetter: true,
  }, [
    { name: "Newsletter", series: S("sv0", 1800, { drift: 0.02, integer: true, noise: 0.08 }) },
    { name: "Promotional", series: S("sv1", 1100, { drift: 0.02, dir: 1, integer: true, noise: 0.15 }) },
    { name: "Automated flows", series: S("sv2", 940, { drift: 0.03, dir: 1, integer: true, noise: 0.1 }) },
    { name: "Transactional", series: S("sv3", 380, { drift: 0.02, integer: true, noise: 0.1 }) },
  ]);

  add("spark_top_clicked", {
    section: "campaign_performance.clicks", label: "Top Clicked Links", kind: "feed",
    itemLabel: "Link", format: "number", higherIsBetter: true,
    columns: [
      { key: "clicks", label: "Clicks", format: "number" },
      { key: "ctr", label: "CTR", format: "percent" },
      { key: "campaign", label: "From campaign", format: "text" },
    ],
  }, [
    { name: "/book-now", series: [], extra: { clicks: 84, ctr: 2.1, campaign: "Summer Promo — 20% off" } },
    { name: "/services", series: [], extra: { clicks: 61, ctr: 1.5, campaign: "July Newsletter" } },
    { name: "Review us on Google", series: [], extra: { clicks: 48, ctr: 3.4, campaign: "Review Request Blast" } },
    { name: "/pricing", series: [], extra: { clicks: 37, ctr: 0.9, campaign: "July Newsletter" } },
    { name: "/referral-program", series: [], extra: { clicks: 29, ctr: 1.8, campaign: "Referral Program Launch" } },
  ]);

  add("spark_campaigns", {
    section: "campaign_performance.opens", label: "Campaign Performance", kind: "feed",
    itemLabel: "Campaign", format: "number", higherIsBetter: true,
    columns: [
      { key: "sent", label: "Sent", format: "number" },
      { key: "openRate", label: "Open %", format: "percent" },
      { key: "clickRate", label: "Click %", format: "percent" },
      { key: "when", label: "Sent on", format: "text" },
    ],
  }, ["July Newsletter", "Summer Promo — 20% off", "Review Request Blast", "Service Reminder", "June Newsletter", "Spring Cleanup Offer", "Referral Program Launch", "May Newsletter"].map((n, i) => ({
    name: n, series: [],
    extra: { sent: 380 + ((i * 97) % 300), openRate: Number((16 + ((i * 13) % 14) + (i === 1 ? 6 : 0)).toFixed(1)), clickRate: Number((1.2 + ((i * 7) % 30) / 10).toFixed(1)), when: `${i * 11 + 4}d ago` },
  })));

  add("spark_bounce_domains", {
    section: "deliverability.delivery", label: "Bounces by Inbox Provider",
    itemLabel: "Provider", primaryLabel: "Bounces", format: "count", higherIsBetter: false,
  }, [
    { name: "gmail.com", series: S("b0", 14, { drift: -0.01, integer: true, noise: 0.2 }) },
    { name: "yahoo.com", series: S("b1", 8, { drift: -0.005, integer: true, noise: 0.25, dir: 1 }) },
    { name: "outlook.com / hotmail", series: S("b2", 7, { drift: -0.01, integer: true, noise: 0.25 }) },
    { name: "Corporate domains", series: S("b3", 11, { drift: 0.005, integer: true, noise: 0.2, dir: 1 }) },
  ]);

  add("spark_unsub_reasons", {
    section: "deliverability.reputation", label: "Unsubscribes & Complaints", kind: "feed",
    itemLabel: "Reason", format: "count", higherIsBetter: false,
    columns: [{ key: "count", label: "This month", format: "number" }, { key: "prev", label: "Last month", format: "number" }],
  }, [
    { name: "Too many emails", series: [], extra: { count: 9, prev: 6 } },
    { name: "No longer interested", series: [], extra: { count: 7, prev: 8 } },
    { name: "Never signed up", series: [], extra: { count: 2, prev: 3 } },
    { name: "Marked as spam", series: [], extra: { count: 1, prev: 2 } },
  ]);

  add("spark_automations", {
    section: "automation_retention.automation", label: "Automation Performance",
    itemLabel: "Automation", primaryLabel: "Executions", format: "count", higherIsBetter: true,
    columns: [{ key: "conv", label: "Goal %", format: "percent" }],
  }, [
    { name: "Welcome Series", series: S("a0", 96, { drift: 0.03, dir: 1, integer: true, noise: 0.12 }), extra: { conv: 12 } },
    { name: "Quote Follow-up", series: S("a1", 64, { drift: 0.02, dir: 1, integer: true, noise: 0.15 }), extra: { conv: 17 } },
    { name: "Review Request", series: S("a2", 58, { drift: 0.02, integer: true, noise: 0.15 }), extra: { conv: 24 } },
    { name: "Win-back (90-day lapsed)", series: S("a3", 41, { drift: 0.01, dir: -1, integer: true, noise: 0.2 }), extra: { conv: 6 } },
    { name: "Birthday / Anniversary", series: S("a4", 22, { integer: true, noise: 0.2 }), extra: { conv: 8 } },
  ]);

  add("spark_engagement_cohorts", {
    section: "automation_retention.retention", label: "Contacts by Engagement Cohort",
    itemLabel: "Cohort", primaryLabel: "Contacts", format: "count", higherIsBetter: true,
  }, [
    { name: "Highly engaged (30d)", series: S("e0", 240, { drift: 0.02, dir: 1, integer: true, noise: 0.06 }) },
    { name: "Engaged (90d)", series: S("e1", 310, { drift: 0.015, integer: true, noise: 0.05 }) },
    { name: "Cooling (91–180d)", series: S("e2", 205, { drift: 0.005, integer: true, noise: 0.06, dir: 1 }) },
    { name: "Dormant (180d+)", series: S("e3", 340, { drift: -0.002, integer: true, noise: 0.04 }) },
  ]);

  return reports;
}
