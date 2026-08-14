// deepConfigs.ts — what "deep" means per report, as declared config.
//
// The deep-report engine (deepReport.ts) derives summary/movements/item-detail
// for every report automatically. This file adds the report-specific layers:
// which bands make its distribution chart, which segments to roll up, which
// opportunity lists to compute, and which warnings to flag. A quarterly model
// review edits THIS file to deepen a report.
//
// Keys are DetailReport ids (unique across platforms: ARION ids unprefixed
// from the server, spark_/oliver_/argus_ prefixed client-side, and the
// intelligence-mirror ids like keyword_forecast).

import type { DeepConfig, DeepBand } from "./deepReport";
import type { DetailItem } from "./detail";
import { pluralize } from "./detail";

const lastOf = (it: DetailItem) => it.series?.filter((v): v is number => v != null).slice(-1)[0] ?? null;

// ── shared band sets ──────────────────────────────────────────────────────
/** Keyword position bands — the classic ranking distribution. Order matters (top band first). */
export const POSITION_BANDS: DeepBand[] = [
  { label: "Top 3",       color: "#15803d", test: (v) => v <= 3 },
  { label: "Positions 4–10",  color: "#65a30d", test: (v) => v <= 10 },
  { label: "Positions 11–20", color: "#f59e0b", test: (v) => v <= 20 },
  { label: "Positions 21–50", color: "#f97316", test: (v) => v <= 50 },
  { label: "Beyond 50",   color: "#dc2626", test: () => true },
];

const RATE_BANDS = (good: number, ok: number): DeepBand[] => [
  { label: `Above ${good}%`, color: "#15803d", test: (v) => v >= good },
  { label: `${ok}–${good}%`, color: "#f59e0b", test: (v) => v >= ok },
  { label: `Below ${ok}%`,   color: "#dc2626", test: () => true },
];

// ── keyword deep layers (the exemplar) ────────────────────────────────────
const keywordSegments = [
  { label: "By intent", of: (it: DetailItem) => String(it.extra?.intent || "Other") },
  { label: "Branded vs non-branded", of: (it: DetailItem) => String(it.extra?.branded || "Non-branded") },
];

const keywordOpportunities = [
  {
    title: "Striking distance (positions 4–10)",
    note: "Small gains here reach the top 3, where most clicks live.",
    filter: (it: DetailItem) => { const p = lastOf(it); return p != null && p > 3 && p <= 10; },
    sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.volume || 0) - Number(a.extra?.volume || 0),
  },
  {
    title: "Page-2 quick wins (11–20)",
    note: "Highest-volume keywords one push from page one.",
    filter: (it: DetailItem) => { const p = lastOf(it); return p != null && p > 10 && p <= 20; },
    sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.volume || 0) - Number(a.extra?.volume || 0),
  },
  {
    title: "Declining but valuable — defend these",
    filter: (it: DetailItem) => { const m = it.momPct; return m != null && m > 3 && Number(it.extra?.volume || 0) > 800; }, // position rising = worse
    sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.volume || 0) - Number(a.extra?.volume || 0),
  },
];

const cannibalizationFlag = (it: DetailItem, all: DetailItem[]): string | null => {
  const url = it.extra?.url;
  if (!url) return null;
  const p = lastOf(it);
  if (p == null || p > 30) return null;
  const rival = all.find((o) => o !== it && o.extra?.url === url && (lastOf(o) ?? 99) <= 30);
  return rival ? `Cannibalization risk — competes with "${rival.name}" for ${url}` : null;
};

// ── the config map ────────────────────────────────────────────────────────
export const DEEP_CONFIGS: Record<string, DeepConfig> = {
  // ══ ARION ══
  keyword_movement: { bands: POSITION_BANDS, segments: keywordSegments, opportunities: keywordOpportunities, flag: cannibalizationFlag, weightKey: "volume" },
  share_of_voice: { composition: true },
  query_performance: {
    weightKey: "impressions",
    opportunities: [{
      title: "Ranking well, under-clicked — title/meta rewrites",
      note: "Position is top-10 but CTR is below 2% — the listing isn't earning its position.",
      filter: (it) => Number(it.extra?.position || 99) <= 10 && Number(it.extra?.ctr || 99) < 2,
      sortBy: (a, b) => Number(b.extra?.impressions || 0) - Number(a.extra?.impressions || 0),
    }],
  },
  page_search_performance: { weightKey: "impressions" },
  striking_distance: { weightKey: "volume" },
  ctr_by_query: { weightKey: "position" },
  channel_breakdown: { composition: true },
  referral_sources: { composition: true },
  device_breakdown: { composition: true },
  search_device_split: { composition: true },
  geography: { composition: true },
  gbp_discovery_split: { composition: true },
  gbp_action_breakdown: { composition: true },
  conversion_by_source: { composition: true },
  top_pages: {
    segments: [{ label: "By engagement", of: (it) => Number(it.extra?.engagement || 0) >= 60 ? "Engaging (60%+)" : Number(it.extra?.engagement || 0) >= 40 ? "Average" : "Weak (<40%)" }],
  },
  content_age: { composition: true },
  content_gap_keywords: { weightKey: "volume" },
  engagement_by_channel: { composition: false },
  pagespeed_history: { bands: [
    { label: "Good (90+)",   color: "#15803d", test: (v) => v >= 90 },
    { label: "Fair (50–89)", color: "#f59e0b", test: (v) => v >= 50 },
    { label: "Poor (<50)",   color: "#dc2626", test: () => true },
  ]},
  referring_domains: { composition: true },

  // Intelligence-mirror reports reuse the same shapes on projected series.
  keyword_forecast: { bands: POSITION_BANDS, segments: keywordSegments, weightKey: "volume" },
  keyword_opp: { bands: POSITION_BANDS, weightKey: "volume" },
  query_forecast: { weightKey: "volume" },
  referral_forecast: { composition: true },

  // ══ SPARK ══
  spark_contact_sources: { composition: true },
  spark_sends_by_type: { composition: true },
  spark_conversion_by_source: { weightKey: "convRate" },
  spark_lead_sources: { composition: true },
  spark_stage_flow: { composition: true },
  spark_list_hygiene: { composition: true },
  spark_bounce_domains: { composition: true },
  spark_engagement_cohorts: { composition: true },
  spark_automations: {
    segments: [{ label: "By conversion", of: (it) => Number(it.extra?.conv || 0) >= 10 ? "Converting (10%+)" : "Below 10%" }],
  },

  // ══ OLIVER ══
  oliver_revenue_by_service: { composition: true },
  oliver_invoice_size: { composition: true },
  oliver_backlog_age: { composition: true },
  oliver_quote_size: { composition: true },
  oliver_booked_ahead: { composition: true },
  oliver_invoice_aging: { composition: true },
  oliver_jobs_by_service: { composition: true },
  oliver_quotes_by_service: {
    segments: [{ label: "By win rate", of: (it) => Number(it.extra?.winRate || 0) >= 40 ? "Winning (40%+)" : "Under 40%" }],
  },
  oliver_crew_performance: {
    segments: [{ label: "By on-time", of: (it) => Number(it.extra?.onTime || 0) >= 90 ? "Reliable (90%+)" : "Needs attention" }],
  },
  oliver_top_customers: { weightKey: "ltv" },

  // ══ ARION — Website Upkeep (2026-08-14) ══
  // Brandon's question: "are you actually maintaining your website properly."
  //
  // Each component's series holds its STATUS CODE, one point per snapshot day:
  //   0 = current · 1 = update available · 2 = dormant + outdated
  // The engine's band distribution reads it.series, so a `feed` (no series)
  // would leave bands silently dead. With the code in the series the bands read
  // as "composition of the site today", and become a real 12-month distribution
  // as the nightly snapshot accumulates — same config, no change needed.
  component_upkeep: {
    bands: [
      { label: "Current", color: "#15803d", test: (v) => v === 0 },
      { label: "Update available", color: "#f59e0b", test: (v) => v === 1 },
      { label: "Dormant + outdated", color: "#dc2626", test: () => true },
    ],
    segments: [
      // Active vs inactive is the segment owners never think about: an inactive
      // plugin still ships its code and still carries its vulnerabilities.
      { label: "Active vs inactive", of: (it: DetailItem) => String(it.extra?.state || "Unknown") },
      { label: "By status", of: (it: DetailItem) => String(it.extra?.status || "Unknown") },
      { label: "By author", of: (it: DetailItem) => String(it.extra?.author || "Unknown") },
    ],
    opportunities: [
      {
        title: "Update these first — running and behind",
        note: "Active components with a published update waiting. Each one is a fix that exists and has not been taken.",
        filter: (it: DetailItem) => Number(it.extra?.needs_update) === 1 && Number(it.extra?.is_active) === 1,
        sortBy: (a: DetailItem, b: DetailItem) => String(a.name).localeCompare(String(b.name)),
      },
      {
        title: "Dormant risk — inactive but still installed",
        note: "Deactivated code still sits on the server and still carries its vulnerabilities. Remove it or keep it patched; leaving it is the worst of both.",
        filter: (it: DetailItem) => Number(it.extra?.is_active) === 0,
        sortBy: (a: DetailItem, b: DetailItem) => String(a.name).localeCompare(String(b.name)),
      },
    ],
    // Surfaced per row so the reason is next to the component, not in a legend.
    flag: (it: DetailItem) => {
      const needs = Number(it.extra?.needs_update) === 1;
      const active = Number(it.extra?.is_active) === 1;
      if (needs && !active) return "Inactive AND outdated — its code still ships with the site";
      if (!active) return "Inactive — still installed, still a surface";
      if (needs) return "Update published and not applied";
      return null;
    },
  },

  // ARION - Content Library (2026-08-14)
  //
  // Brandon: "I want them to see the things I would as a consultant point out
  // as you are doing great in this area, don't lose focus here but here are the
  // areas that you have opportunities."
  //
  // Series is WORD COUNT, so the depth bands below are the same thin / standard
  // / long / pillar buckets the plugin already reports. Everything a consultant
  // would actually flag lives in the opportunity lists, because that is the part
  // an owner can act on without being an analyst.
  content_library: {
    bands: [
      { label: "Pillar (2,000+)", color: "#15803d", test: (v) => v >= 2000 },
      { label: "Long (1,000-1,999)", color: "#65a30d", test: (v) => v >= 1000 },
      { label: "Standard (300-999)", color: "#f59e0b", test: (v) => v >= 300 },
      { label: "Thin (under 300)", color: "#dc2626", test: () => true },
    ],
    segments: [
      { label: "Pages vs posts", of: (it: DetailItem) => String(it.extra?.type || "unknown") },
      {
        label: "Freshness",
        of: (it: DetailItem) => {
          const d = Number(it.extra?.days_since_update || 0);
          if (d <= 90) return "Updated in 90 days";
          if (d <= 365) return "3-12 months";
          return "Over a year";
        },
      },
      {
        label: "On-page SEO",
        of: (it: DetailItem) => {
          const v = Number(it.extra?.seo || 0);
          if (v >= 80) return "Good (80+)";
          if (v >= 50) return "Needs work (50-79)";
          if (v > 0) return "Poor (under 50)";
          return "Not scored";
        },
      },
    ],
    opportunities: [
      {
        title: "Competing with each other",
        note: "More than one page declares the same focus keyword. They split the signal and Google picks one - usually not the one you would choose. Consolidate or re-target.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} are competing against each other for the same search term. You are bidding against yourself: Google picks one and buries the rest, and it rarely picks the page you would have chosen. Merging them into a single stronger page is usually the highest-value hour on this list.`,
        filter: (it: DetailItem) => Number(it.extra?.competing || 1) > 1,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.competing || 0) - Number(a.extra?.competing || 0),
      },
      {
        title: "No meta description",
        note: "Google writes its own snippet when you leave this blank. It is the cheapest fix on the site and it changes what a searcher reads before deciding to click.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} have no meta description, so Google is writing your sales pitch for you - usually by grabbing the first sentence it finds. This is the cheapest fix on the whole site and it changes what a searcher reads before deciding whether to click you or the next result.`,
        filter: (it: DetailItem) => String(it.extra?.meta) === "Missing",
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.words || 0) - Number(a.extra?.words || 0),
      },
      {
        title: "Thin pages worth expanding",
        note: "Under 300 words. Too short to answer a real question or to rank for one.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} are under 300 words - too short to answer a real question, which is what Google is trying to reward. Pick the two or three that describe what you actually sell and give each one a proper answer.`,
        filter: (it: DetailItem) => Number(it.extra?.words || 0) < 300,
        sortBy: (a: DetailItem, b: DetailItem) => Number(a.extra?.words || 0) - Number(b.extra?.words || 0),
      },
      {
        title: "Untouched for over a year",
        note: "Content decays. A page that has not been revisited in a year is usually losing ground to someone who did revisit theirs.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} have not been touched in over a year. Content decays - the competitor who refreshed theirs is the one gaining the ground you lose.`,
        filter: (it: DetailItem) => Number(it.extra?.days_since_update || 0) > 365,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.days_since_update || 0) - Number(a.extra?.days_since_update || 0),
      },
      {
        title: "No focus keyword set",
        note: "Nothing tells the page what it is trying to rank for, so nothing is measuring whether it does.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} have no focus keyword, so nothing declares what they are trying to rank for and nothing is measuring whether they do.`,
        filter: (it: DetailItem) => !it.extra?.focus_keyword || it.extra?.focus_keyword === "-",
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.words || 0) - Number(a.extra?.words || 0),
      },
      {
        title: "Hidden from search on purpose",
        note: "Marked noindex. Correct for thank-you and policy pages - worth a look if anything here should be earning traffic.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} are marked hidden from search. That is correct for thank-you and policy pages - check that nothing here is a page you expected to be earning traffic.`,
        filter: (it: DetailItem) => Number(it.extra?.noindex) === 1,
      },
    ],
    // The reason sits next to the page, not in a legend. Most severe first.
    flag: (it: DetailItem) => {
      if (Number(it.extra?.competing || 1) > 1) {
        return `Competing with ${Number(it.extra?.competing) - 1} other page(s) for "${it.extra?.focus_keyword}"`;
      }
      if (Number(it.extra?.noindex) === 1) return "Hidden from search (noindex)";
      if (Number(it.extra?.words || 0) < 300) return "Thin - under 300 words";
      if (Number(it.extra?.days_since_update || 0) > 365) {
        return `Not updated in ${Math.round(Number(it.extra?.days_since_update) / 30)} months`;
      }
      if (String(it.extra?.meta) === "Missing") return "No meta description";
      return null;
    },
    weightKey: "words",
  },

  // ══ ARGUS ══
  argus_impressions_by_channel: { composition: true },
  argus_leads_by_source: { composition: true },
  argus_revenue_by_source: { composition: true },
  argus_events_by_product: { composition: true },
};

export function deepConfigFor(reportId: string): DeepConfig | undefined {
  return DEEP_CONFIGS[reportId];
}
