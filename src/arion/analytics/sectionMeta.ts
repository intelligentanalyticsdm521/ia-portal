// sectionMeta.ts — display metadata for ARION Trend report SECTIONS.
//
// A "section" is one entry in an engine's `scoreInputs` array: a major
// contributor to that report's score, carrying its own weight. These are the
// units the report modal is built from (Brandon, 2026-07-24):
//
//   "Each report has major contributors to the overall report score. I'd call
//    these sections... This is your big 'oh shit this area dropped I need to
//    look into it' or 'hey your last month's changes are really showing
//    progress'."
//
// Each section renders as a visual/KPI card with its month-over-month move and
// a plain-language blurb, and expands into the detailed breakdown behind it.
//
// Throwing a wall of data points at a small-business owner is the opposite of
// useful — they will not understand it, so they stop opening the report. The
// section IS the unit of understanding.

/** How to render a section's raw value. */
export type SectionFormat = "percent" | "number" | "score" | "position" | "ms" | "rating" | "count";

export interface SectionMeta {
  /** Plain-language name — never the raw key. */
  label: string;
  format: SectionFormat;
  /** false when a LOWER number is better (bounce rate, avg position, thin content). */
  higherIsBetter: boolean;
  /** One line on what this measures and why it matters, in the owner's language. */
  what: string;
  /** Which visual suits the shape of this metric. */
  visual: "line" | "gauge" | "donut" | "stat";
}

const S = (
  label: string, format: SectionFormat, higherIsBetter: boolean,
  visual: SectionMeta["visual"], what: string,
): SectionMeta => ({ label, format, higherIsBetter, visual, what });

export const SECTION_META: Record<string, SectionMeta> = {
  // ── Search Visibility ──
  impression_to_visit:   S("Impression to Visit Rate", "percent", true, "gauge", "Of everyone who saw you in search results, how many actually clicked through."),
  local_traffic_share:   S("Local Traffic Share", "percent", true, "donut", "How much of your traffic comes from the area you actually serve."),
  channel_diversity:     S("Channel Diversity", "percent", true, "donut", "How spread out your traffic is. Relying on one channel is a risk."),
  non_brand_impressions: S("Non-Brand Impressions", "number", true, "line", "People finding you who were not already searching your name — real new demand."),
  avg_position:          S("Average Position", "position", false, "line", "Where you typically rank. Lower is better; position 1 is the top result."),
  ctr_vs_benchmark:      S("Click-Through vs Typical", "percent", true, "gauge", "Whether your titles and descriptions earn more clicks than a typical listing at your position."),
  quick_win_count:       S("Quick-Win Keywords", "count", true, "stat", "Keywords sitting on page 2. Small gains here move them to page 1."),
  non_brand_balance:     S("Brand vs Non-Brand Mix", "percent", true, "donut", "Growth should come from people who did not already know your name."),

  // ── Audience & Conversion ──
  engagement_rate:       S("Engagement Rate", "percent", true, "gauge", "How many visitors actually did something instead of leaving immediately."),
  bounce_rate:           S("Bounce Rate", "percent", false, "gauge", "Visitors who left without interacting. Lower is better."),
  mobile_share:          S("Mobile Share", "percent", true, "donut", "How much of your audience is on a phone — it changes what to optimise."),
  new_returning_balance: S("New vs Returning", "percent", true, "donut", "A healthy business grows new visitors while keeping the old ones coming back."),
  session_quality:       S("Session Quality", "score", true, "gauge", "How deeply people engage once they arrive."),
  visit_to_submit:       S("Visit to Enquiry Rate", "percent", true, "gauge", "Of everyone who visits, how many contact you. The number that becomes revenue."),
  form_completion:       S("Form Completion", "percent", true, "gauge", "How many people who start your form actually finish it."),
  form_to_contact:       S("Enquiry to Contact Rate", "percent", true, "gauge", "How many form submissions became a real contact record."),
  cta_placement:         S("Call-to-Action Coverage", "score", true, "stat", "Whether your key pages actually ask the visitor to do something."),

  // ── Local Presence ──
  gbp_connected:         S("Profile Connected", "score", true, "stat", "Whether your Google Business Profile is linked and syncing."),
  completeness:          S("Profile Completeness", "percent", true, "gauge", "How much of your listing is filled in. Google favours complete profiles."),
  rating:                S("Average Rating", "rating", true, "gauge", "Your star rating — the first thing a local customer looks at."),
  review_velocity_trend: S("Review Velocity", "number", true, "line", "New reviews per month. A steady flow signals an active business."),
  response_rate:         S("Review Response Rate", "percent", true, "gauge", "How many reviews you reply to. Replying visibly affects ranking and trust."),

  // ── Social Presence ──
  posts_30d:             S("Posting Cadence", "count", true, "line", "Posts published in the last 30 days. Reach decays fast without cadence."),
  follower_growth:       S("Audience Growth", "percent", true, "line", "Whether your following is growing, flat, or shrinking."),

  // ── Content ──
  content_gap_count:     S("Content Gaps", "count", false, "stat", "Searches you get impressions for with no page that answers them."),
  thin_content_ratio:    S("Thin Content", "percent", false, "gauge", "Pages too short to rank or convince anyone."),
  avg_post_depth:        S("Average Content Depth", "number", true, "line", "How substantial your pages are on average."),
  engagement_pct:        S("Content Engagement", "percent", true, "gauge", "Whether people actually read what you publish."),

  // ── Technical & Site Health ──
  mobile_perf:           S("Mobile Performance", "score", true, "gauge", "How fast your site feels on a phone, scored by Google."),
  cwv_score:             S("Core Web Vitals", "score", true, "gauge", "Google's real-world speed and stability measures — a ranking factor."),
  security_score:        S("Security Posture", "score", true, "gauge", "Blocked attacks, firewall status and known vulnerabilities."),
  plugins_updates:       S("Plugin and Update Health", "score", true, "stat", "Out-of-date plugins are the most common way a site gets compromised."),
};

/**
 * Look up a section's metadata.
 *
 * Merged reports prefix their section keys with the constituent engine
 * ("reach.impression_to_visit"), so strip the prefix before matching. The
 * fallback turns an unmapped key into a readable title rather than leaking a
 * raw slug into the UI.
 */
export function sectionMeta(key: string): SectionMeta {
  const bare = key.includes(".") ? key.split(".").slice(1).join(".") : key;
  return (
    SECTION_META[bare] ||
    SECTION_META[key] ||
    S(bare.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), "number", true, "stat", "")
  );
}

/** Format a section value for display. */
export function formatSectionValue(v: number | string | null, format: SectionFormat): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n)) return String(v);
  switch (format) {
    case "percent":  return `${n.toFixed(n < 10 ? 2 : 1)}%`;
    case "position": return n.toFixed(1);
    case "rating":   return n.toFixed(1);
    case "ms":       return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
    case "score":    return String(Math.round(n));
    case "count":    return String(Math.round(n));
    default:         return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : String(n);
  }
}

export interface SectionDelta {
  pct: number;
  /** Direction-aware: a falling bounce rate is an IMPROVEMENT. */
  improved: boolean;
  blurb: string;
}

/**
 * Month-over-month move for one section, in plain language.
 *
 * Returns null when there is no prior month. A first-month report should say
 * "we will compare next month" rather than invent a change.
 */
export function sectionDelta(
  current: number | string | null,
  prior: number | string | null | undefined,
  meta: SectionMeta,
): SectionDelta | null {
  const c = typeof current === "number" ? current : Number(current);
  const p = typeof prior === "number" ? prior : Number(prior);
  if (!isFinite(c) || !isFinite(p) || p === 0) return null;

  const pct = ((c - p) / Math.abs(p)) * 100;
  if (Math.abs(pct) < 1) return { pct, improved: true, blurb: "Holding steady on last month." };

  const rose = pct > 0;
  const improved = meta.higherIsBetter ? rose : !rose;
  const mag = Math.abs(pct);
  const dir = rose ? "up" : "down";

  let blurb: string;
  if (improved && mag >= 20) blurb = `Great month — ${dir} ${mag.toFixed(0)}% on last month.`;
  else if (improved)         blurb = `Moving the right way, ${dir} ${mag.toFixed(0)}% on last month.`;
  else if (mag >= 20)        blurb = `Down sharply — ${dir} ${mag.toFixed(0)}% on last month. Worth a look.`;
  else                       blurb = `Slipped ${mag.toFixed(0)}% on last month.`;

  return { pct, improved, blurb };
}
