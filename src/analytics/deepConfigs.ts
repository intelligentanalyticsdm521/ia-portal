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
/** Position bands applied to a page+query pair's POSITION column rather than
 *  its series (the pair report's series is clicks). */
export const POSITION_BANDS_FOR_PAIRS: DeepBand[] = [
  { label: "Page one (1-10)", color: "#15803d", test: (v) => v >= 3 },
  { label: "Some clicks", color: "#65a30d", test: (v) => v >= 1 },
  { label: "No clicks yet", color: "#f59e0b", test: () => true },
];

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
    // The series is a status code, not a count. Without this the report
    // reported "TOTAL STATUS 9" and described a plugin needing an update
    // as a volatile 50% decline.
    categorical: true,
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
        lede: (n: number, label: string) =>
          `${n} active ${pluralize(label.toLowerCase(), n)} ${n === 1 ? "is" : "are"} running a version behind the one that is published. Out-of-date plugins are the number-one way small-business sites get broken into, and every one of these is a fix that already exists and simply has not been applied.`,
        filter: (it: DetailItem) => Number(it.extra?.needs_update) === 1 && Number(it.extra?.is_active) === 1,
        sortBy: (a: DetailItem, b: DetailItem) => String(a.name).localeCompare(String(b.name)),
      },
      {
        title: "Dormant risk — inactive but still installed",
        note: "Deactivated code still sits on the server and still carries its vulnerabilities. Remove it or keep it patched; leaving it is the worst of both.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} ${n === 1 ? "is" : "are"} switched off but still installed. Deactivating is not removing — the code is still on the server, still reachable, and still carries whatever it carried. Delete what you have stopped using.`,
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

  // ── The four that had no config (2026-08-14) ─────────────────────────────
  // Produced since before today and rendering with engine defaults the whole
  // time: a table, a sparkline and a generic narrative, with none of the
  // findings that make a report worth opening.

  // Ranking well and not being clicked is a TITLE problem, not a ranking
  // problem, and it is the cheapest fix in search — the page already won the
  // position it needed.
  ctr_opportunity: {
    bands: [
      { label: "Big gap (10pp+ under)", color: "#dc2626", test: () => false },
      { label: "Under-performing", color: "#f59e0b", test: () => false },
      { label: "At or above expected", color: "#15803d", test: () => true },
    ],
    segments: [
      {
        label: "Where it ranks",
        of: (it: DetailItem) => {
          const p = Number(it.extra?.position || 0);
          if (p <= 3) return "Top 3";
          if (p <= 10) return "Rest of page one";
          return "Page two or worse";
        },
      },
    ],
    opportunities: [
      {
        title: "Rewrite these titles first",
        note: "Ranking on page one and clicked far less than that position normally earns. The listing text is the thing losing the click.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} rank on page one and get clicked far less than that position normally earns. You already did the hard part — the position is won. What is losing the click is the title and description Google is showing, and rewriting those is an afternoon's work.`,
        filter: (it: DetailItem) => Number(it.extra?.position || 99) <= 10 && Number(it.extra?.potential || 0) > 0,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.potential || 0) - Number(a.extra?.potential || 0),
      },
    ],
    flag: (it: DetailItem) =>
      Number(it.extra?.potential || 0) >= 10
        ? `About ${Math.round(Number(it.extra?.potential))} more clicks a month if this matched its position`
        : null,
    weightKey: "impressions",
  },

  // A landing page is where a visit is won or lost. High traffic with weak
  // engagement is the biggest silent leak a site can have.
  engagement_by_page: {
    bands: [
      { label: "Holds attention (60%+)", color: "#15803d", test: (v) => v >= 60 },
      { label: "Average (40-59%)", color: "#65a30d", test: (v) => v >= 40 },
      { label: "Weak (20-39%)", color: "#f59e0b", test: (v) => v >= 20 },
      { label: "Losing people (under 20%)", color: "#dc2626", test: () => true },
    ],
    opportunities: [
      {
        title: "Fix these landing pages first",
        note: "People arrive here and leave without engaging. Whatever brought them promised something this page is not delivering.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} lose most of the people who land on them. This is the most expensive kind of problem on a website: you have already paid to get someone there. Fix the page people actually arrive on before writing a new one.`,
        filter: (it: DetailItem) => {
          const v = Number(it.series?.filter((x): x is number => x != null).slice(-1)[0] || 0);
          return v > 0 && v < 30;
        },
      },
    ],
    flag: (it: DetailItem) => {
      const v = Number(it.series?.filter((x): x is number => x != null).slice(-1)[0] || 0);
      return v > 0 && v < 20 ? `Only ${v.toFixed(0)}% engage — most arrive and leave` : null;
    },
  },

  // What people TYPED to find the listing. Google reports low-volume terms as a
  // threshold rather than a count, which the report shows honestly rather than
  // rounding to a number nobody can act on.
  gbp_search_keywords: {
    bands: [
      { label: "Strong (100+)", color: "#15803d", test: (v) => v >= 100 },
      { label: "Steady (25-99)", color: "#65a30d", test: (v) => v >= 25 },
      { label: "Occasional (under 25)", color: "#f59e0b", test: () => true },
    ],
    segments: [
      {
        label: "Search type",
        of: (it: DetailItem) => {
          // A search containing the business name is someone who already knew
          // you. Everything else is genuinely new discovery, and that is the
          // number that says whether local SEO is working.
          const n = String(it.name || "").toLowerCase();
          return /\b(llc|inc|dental|dentist|co\b|company)\b/.test(n) ? "Looks branded" : "Discovery";
        },
      },
    ],
    opportunities: [
      {
        title: "Terms worth a page of their own",
        note: "People are already finding your listing with these. A page on your site targeting the same term compounds it.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} bring people to your listing regularly. Each one is a proven demand signal — a page on your own site aimed at the same term turns one listing into two results.`,
        filter: (it: DetailItem) => Number(it.series?.filter((x): x is number => x != null).slice(-1)[0] || 0) >= 25,
        sortBy: (a: DetailItem, b: DetailItem) =>
          Number(b.series?.filter((x): x is number => x != null).slice(-1)[0] || 0) -
          Number(a.series?.filter((x): x is number => x != null).slice(-1)[0] || 0),
      },
    ],
  },

  // A step change is not the same thing as a trend, and it usually has a cause
  // with a date — a redesign, a migration, an algorithm update.
  trend_breaks: {
    segments: [
      { label: "Direction", of: (it: DetailItem) => (Number(it.extra?.changePct || 0) >= 0 ? "Stepped up" : "Stepped down") },
      { label: "When", of: (it: DetailItem) => String(it.extra?.breakMonth || "-") },
    ],
    opportunities: [
      {
        title: "Something changed here — find out what",
        note: "A sharp drop that held. Compare the month against anything you changed: a redesign, a migration, a plugin, a Google update.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} did not drift — they stepped down and stayed there. A break like this has a cause with a date on it. Look at what changed that month before treating it as a slow decline, because the fix is usually to undo one thing rather than to work harder at everything.`,
        filter: (it: DetailItem) => Number(it.extra?.changePct || 0) <= -15,
        sortBy: (a: DetailItem, b: DetailItem) => Number(a.extra?.changePct || 0) - Number(b.extra?.changePct || 0),
      },
      {
        title: "Something worked — find out what",
        note: "A sharp rise that held. Worth knowing what caused it so it can be repeated.",
        filter: (it: DetailItem) => Number(it.extra?.changePct || 0) >= 15,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.changePct || 0) - Number(a.extra?.changePct || 0),
      },
    ],
    flag: (it: DetailItem) => {
      const c = Number(it.extra?.changePct || 0);
      if (c <= -15) return `Stepped down ${Math.abs(c).toFixed(0)}% in ${it.extra?.breakMonth}`;
      if (c >= 15) return `Stepped up ${c.toFixed(0)}% in ${it.extra?.breakMonth}`;
      return null;
    },
  },

  // ── 2026-08-14: reports over the newly captured integration dimensions ──
  // Bands and opportunity lists only where they say something an owner can act
  // on. A report that would only get a generic "top group" story is left with
  // the engine's defaults rather than dressed up.

  // Where a visitor came from geographically. For a local service business,
  // traffic from outside the service area is not a win — it is noise that
  // makes every other number look better than it is.
  audience_by_country: {
    segments: [
      { label: "Engagement", of: (it: DetailItem) => Number(it.extra?.bounce || 0) > 70 ? "Bounces straight off" : "Sticks around" },
    ],
    opportunities: [
      {
        title: "High bounce, real volume",
        note: "Enough visitors to matter, and almost all of them leave immediately.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} send you real traffic that leaves almost immediately. Either the page does not match what they expected, or they were never your customer — worth knowing which before paying for more of it.`,
        filter: (it: DetailItem) => Number(it.extra?.bounce || 0) > 70,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.users || 0) - Number(a.extra?.users || 0),
      },
    ],
    flag: (it: DetailItem) => (Number(it.extra?.bounce || 0) > 80 ? `${it.extra?.bounce}% leave without doing anything` : null),
    weightKey: "users",
  },

  // A browser with a bounce rate far above the others is usually a BROKEN
  // browser, and nothing else in the stack would ever tell an owner that.
  browser_experience: {
    opportunities: [
      {
        title: "Something is wrong in this browser",
        note: "Bounce rate well above the site's norm. Usually a layout or script that only breaks here.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} lose almost everyone who arrives in them. When one browser behaves this differently from the others it is nearly always broken rather than unpopular — open the site in it and look.`,
        filter: (it: DetailItem) => Number(it.extra?.bounce || 0) > 75 && Number(it.series?.filter((v): v is number => v != null).slice(-1)[0] || 0) >= 5,
      },
    ],
    flag: (it: DetailItem) => (Number(it.extra?.bounce || 0) > 75 ? `${it.extra?.bounce}% bounce — check the site in this browser` : null),
  },

  device_os_split: {
    flag: (it: DetailItem) => (Number(it.extra?.bounce || 0) > 75 ? `${it.extra?.bounce}% bounce on this OS` : null),
  },

  new_vs_returning: {
    segments: [
      { label: "Visitor type", of: (it: DetailItem) => it.name },
    ],
  },

  // 24 rows. The point is the shape, not the total — it says when someone
  // should be answering the phone and when a campaign should land.
  traffic_by_hour: {
    bands: [
      { label: "Peak", color: "#15803d", test: (v) => v >= 20 },
      { label: "Busy", color: "#65a30d", test: (v) => v >= 8 },
      { label: "Quiet", color: "#f59e0b", test: (v) => v >= 2 },
      { label: "Dead", color: "#94a3b8", test: () => true },
    ],
  },

  traffic_by_medium: {
    opportunities: [
      {
        title: "Sends traffic that does not stay",
        note: "Real volume, high bounce. Worth checking what the promise was before they clicked.",
        filter: (it: DetailItem) => Number(it.extra?.bounce || 0) > 70,
      },
    ],
    flag: (it: DetailItem) => (Number(it.extra?.bounce || 0) > 75 ? `${it.extra?.bounce}% bounce` : null),
  },

  campaign_performance: {
    opportunities: [
      {
        title: "Campaigns that are not landing",
        note: "Traffic arrives and leaves. The ad and the page are promising different things.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} bring people who leave immediately. That is money buying a click and nothing else — usually the landing page does not say what the ad said.`,
        filter: (it: DetailItem) => Number(it.extra?.bounce || 0) > 70,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.users || 0) - Number(a.extra?.users || 0),
      },
    ],
    weightKey: "users",
  },

  page_titles_read: {
    opportunities: [
      {
        title: "Opened and abandoned",
        note: "People arrive and leave without reading. Usually the title promised something the page does not deliver.",
        filter: (it: DetailItem) => Number(it.extra?.bounce || 0) > 75,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.sessions || 0) - Number(a.extra?.sessions || 0),
      },
    ],
    weightKey: "sessions",
  },

  // Search Console
  search_by_country: {
    opportunities: [
      {
        title: "Seen but never clicked",
        note: "Plenty of impressions, almost no clicks. Either the wrong audience or a listing that does not appeal to them.",
        filter: (it: DetailItem) => Number(it.extra?.impressions || 0) > 100 &&
          Number(it.series?.filter((v): v is number => v != null).slice(-1)[0] || 0) < 3,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.impressions || 0) - Number(a.extra?.impressions || 0),
      },
    ],
    weightKey: "impressions",
  },

  // The pair report. Position 11-20 on a page that already exists is the
  // cheapest ranking work available, and this is the only place it is visible
  // per page rather than per keyword.
  page_query_pairs: {
    bands: POSITION_BANDS_FOR_PAIRS,
    opportunities: [
      {
        title: "One push from page one",
        note: "This page already ranks 11-20 for this search. It does not need a new page — it needs this one to be better.",
        lede: (n: number, label: string) =>
          `${n} page-and-search ${pluralize("pair", n)} sit at position 11-20 — page two. The page already exists and Google already associates it with the search; it needs strengthening, not replacing. This is the cheapest ranking work on the site.`,
        filter: (it: DetailItem) => {
          const p = Number(it.extra?.position || 0);
          return p >= 11 && p <= 20;
        },
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.impressions || 0) - Number(a.extra?.impressions || 0),
      },
      {
        title: "Ranking well, nobody clicking",
        note: "Top 10 and still barely clicked. The title and description are not selling the click.",
        filter: (it: DetailItem) => Number(it.extra?.position || 99) <= 10 &&
          Number(it.extra?.impressions || 0) > 50 &&
          Number(it.series?.filter((v): v is number => v != null).slice(-1)[0] || 0) < 3,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.impressions || 0) - Number(a.extra?.impressions || 0),
      },
    ],
    weightKey: "impressions",
  },

  // Business Profile
  gbp_visibility_split: {
    segments: [
      { label: "Surface", of: (it: DetailItem) => String(it.extra?.surface || "-") },
      { label: "Device", of: (it: DetailItem) => String(it.extra?.device || "-") },
    ],
  },

  gbp_actions: {},

  // PageSpeed
  core_web_vitals: {
    segments: [
      { label: "Verdict", of: (it: DetailItem) => String(it.extra?.verdict || "-") },
      { label: "Device", of: (it: DetailItem) => String(it.extra?.strategy || "-") },
    ],
    opportunities: [
      {
        title: "Failing Google's threshold",
        note: "These are the numbers Google ranks on. Anything here is costing rankings and visitors at the same time.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} are outside what Google calls good. These are not vanity numbers — they are a ranking input and a direct measure of what a visitor on a phone puts up with before giving up.`,
        filter: (it: DetailItem) => String(it.extra?.verdict) === "Poor" || String(it.extra?.verdict) === "Needs work",
      },
    ],
    flag: (it: DetailItem) => (String(it.extra?.verdict) === "Poor" ? `Poor — Google wants ${it.extra?.good_at}` : null),
  },

  pagespeed_opportunities: {
    opportunities: [
      {
        title: "Biggest wins first",
        note: "Each row is a specific change with the time it saves. Hand this list to whoever maintains the site.",
        lede: (n: number, label: string) =>
          `${n} named ${pluralize(label.toLowerCase(), n)}, each with what it is worth. This is the list to hand a developer — it is specific enough to act on without anyone needing to diagnose anything first.`,
        filter: () => true,
      },
    ],
  },

  // ARION - Page Reachability (2026-08-14)
  //
  // The question an owner cannot answer from inside WordPress: can anyone
  // actually GET to this page? A page with no inbound link and no menu entry
  // exists only for whoever already has the URL. First real run on
  // intelligentanalyticsdm.com: 30 of 115 pages.
  page_reachability: {
    bands: [
      { label: "Well linked (5+)", color: "#15803d", test: (v) => v >= 5 },
      { label: "Linked (2-4)", color: "#65a30d", test: (v) => v >= 2 },
      { label: "Barely linked (1)", color: "#f59e0b", test: (v) => v >= 1 },
      { label: "Orphan (0)", color: "#dc2626", test: () => true },
    ],
    segments: [
      { label: "In the menu", of: (it: DetailItem) => String(it.extra?.in_menu) === "Yes" ? "In a menu" : "Not in any menu" },
      {
        label: "Links out",
        of: (it: DetailItem) => {
          const n = Number(it.extra?.links_out || 0);
          if (n === 0) return "Dead end (links nowhere)";
          if (n <= 2) return "1-2 links out";
          return "3+ links out";
        },
      },
    ],
    opportunities: [
      {
        title: "Orphans - nothing links here",
        note: "No inbound link from any published page, and not in a menu. Reachable only by someone who already has the URL.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} have nothing pointing at them - no link from another page, no menu entry. You paid to make them and nobody can find them. One internal link from a page that already gets traffic is usually a ten-minute fix.`,
        filter: (it: DetailItem) => Number(it.extra?.orphan) === 1,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.links_out || 0) - Number(a.extra?.links_out || 0),
      },
      {
        title: "Links pointing at pages that are gone",
        note: "These links resolve to nothing. Every one wastes a visitor's click and a little of Google's trust.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} contain links to pages that no longer exist. The Pointing at column lists exactly where each one goes, so this is a fix list rather than a hunt.`,
        filter: (it: DetailItem) => Number(it.extra?.to_missing || 0) > 0,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.to_missing || 0) - Number(a.extra?.to_missing || 0),
      },
      {
        title: "Links to something you never published",
        note: "The target exists but is still a draft. Either publish it or stop linking to it.",
        filter: (it: DetailItem) => Number(it.extra?.to_unpublished || 0) > 0,
      },
      {
        title: "Dead ends - pages that link nowhere",
        note: "A page that sends a reader nowhere next is the end of the visit. Even one relevant onward link changes that.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} link nowhere at all. A reader who finishes one of these has no next step but the back button - and Google reads the same dead end you do.`,
        filter: (it: DetailItem) => Number(it.extra?.links_out || 0) === 0 && Number(it.extra?.orphan) !== 1,
      },
    ],
    flag: (it: DetailItem) => {
      if (Number(it.extra?.orphan) === 1) return "Orphan - nothing links here and it is in no menu";
      if (Number(it.extra?.to_missing || 0) > 0) return `Links to ${it.extra?.to_missing} page(s) that no longer exist`;
      if (Number(it.extra?.links_out || 0) === 0) return "Dead end - links nowhere";
      return null;
    },
    weightKey: "links_in",
  },

  // ARION - Media Library (2026-08-14)
  //
  // Where small-business sites quietly go slow. Nothing in WordPress ever tells
  // an owner that the photo they dropped in is 4MB, that 150 of their images
  // have no alt text, or that most of the library is not used anywhere.
  // Lower IS better here, so the bands run heaviest-first.
  media_library: {
    // Read heaviest-first, because the heavy files are the point of the report.
    // That makes the LAST band the one to aim for, and the engine has to be
    // told: left to its default it would congratulate the owner on growing the
    // "Huge (1MB+)" group.
    goalBand: 3,
    bands: [
      { label: "Huge (1MB+)", color: "#dc2626", test: (v) => v >= 1024 },
      { label: "Large (500KB-1MB)", color: "#f59e0b", test: (v) => v >= 500 },
      { label: "Normal (100-500KB)", color: "#65a30d", test: (v) => v >= 100 },
      { label: "Light (under 100KB)", color: "#15803d", test: () => true },
    ],
    segments: [
      { label: "File type", of: (it: DetailItem) => String(it.extra?.mime || "other") },
      { label: "Used on a page", of: (it: DetailItem) => String(it.extra?.used) === "Yes" ? "In use" : "Not used anywhere" },
      { label: "Alt text", of: (it: DetailItem) => String(it.extra?.alt) === "Yes" ? "Has alt text" : "No alt text" },
    ],
    opportunities: [
      {
        title: "Oversized - shrink these first",
        note: "Over 500KB or wider than 2,500px. Every visitor on a phone downloads the full file.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} are far bigger than they need to be - over 500KB, or wider than any screen will ever show. Every phone visitor downloads them in full, on their data, before your page appears. Resizing these is the single fastest speed win available.`,
        filter: (it: DetailItem) => Number(it.extra?.oversized) === 1,
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.kb || 0) - Number(a.extra?.kb || 0),
      },
      {
        title: "No alt text",
        note: "Alt text is what a screen reader announces and what Google reads. Missing it costs accessibility and image search at once.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} have no alt text. That is what a screen reader announces to someone who cannot see the image, and what Google reads to understand it - so a blank one costs you accessibility and image search in the same stroke. Start with the images on the pages you actually sell from.`,
        filter: (it: DetailItem) => Number(it.extra?.is_image) === 1 && String(it.extra?.alt) === "Missing",
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.kb || 0) - Number(a.extra?.kb || 0),
      },
      {
        title: "Used nowhere",
        note: "Not referenced by any published page and not set as any page's featured image. Dead weight in backups and migrations.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label.toLowerCase(), n)} are not used on any published page. Check before deleting - a file can be referenced from somewhere this scan cannot see - but this is usually years of uploads nobody ever removed, slowing every backup and migration since.`,
        filter: (it: DetailItem) => String(it.extra?.used) === "No",
        sortBy: (a: DetailItem, b: DetailItem) => Number(b.extra?.kb || 0) - Number(a.extra?.kb || 0),
      },
    ],
    flag: (it: DetailItem) => {
      if (Number(it.extra?.oversized) === 1) {
        return `${Number(it.extra?.kb).toLocaleString()}KB${Number(it.extra?.width) > 2500 ? ` at ${it.extra?.dimensions}` : ""} - bigger than any screen needs`;
      }
      if (Number(it.extra?.is_image) === 1 && String(it.extra?.alt) === "Missing") return "No alt text";
      if (String(it.extra?.used) === "No") return "Not used on any page";
      return null;
    },
    weightKey: "kb",
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
      { label: "Thin (under 300)", color: "#dc2626", test: (v) => v > 0 },
      { label: "Empty", color: "#7f1d1d", test: () => true },
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
        title: "Published with nothing on them",
        note: "No body content at all. The page is live and indexable, and there is nothing on it but the site's own header and footer.",
        lede: (n: number, label: string) =>
          `${n} published ${pluralize(label.toLowerCase(), n)} have no content at all — live, indexable, and carrying nothing but your header and footer. Either finish them or unpublish them; an empty page that ranks is worse than one that doesn't exist.`,
        filter: (it: DetailItem) => Number(it.extra?.words || 0) === 0,
      },
      {
        title: "Thin pages worth expanding",
        note: "Under 300 words. Too short to answer a real question or to rank for one.",
        lede: (n: number, label: string) =>
          `${n} ${pluralize(label, n)} are under 300 words - too short to answer a real question, which is what Google is trying to reward. Pick the two or three that describe what you actually sell and give each one a proper answer.`,
        filter: (it: DetailItem) => {
          const w = Number(it.extra?.words || 0);
          return w > 0 && w < 300;            // 0 words is its own list, above
        },
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
      if (Number(it.extra?.words || 0) === 0) return "Published with no content on it";
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
