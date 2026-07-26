// arionDashboards.ts — the ARION Trends catalog.
//
// Declares all six Trends dashboards as data: each dashboard → 3-4 sections →
// data points, every data point carrying its display metadata and (where one
// exists) an industry/absolute benchmark for the Level score. The metric KEYS
// match arion-api/lib/arionMetrics.js.
//
// buildArionDashboards(payload) turns the monthly-series payload from
// GET /arion/insights/metrics into fully scored DashboardScore[] via scoring.ts.
// This is the single source of truth for what ARION Trends measures — a
// quarterly model review edits THIS file.

import {
  scoreDashboard,
  type DashboardInput, type DashboardScore, type DataPointInput,
  type Benchmark, type ValueFormat, type VisualKind, type BenchmarkKind,
} from "./scoring";

// ── A catalog entry: everything about one data point except its series. ──
interface MetricDef {
  key: string;
  label: string;
  what: string;
  higherIsBetter: boolean;
  format: ValueFormat;
  visual: VisualKind;
  weight: number;                 // within its section
  sufficiencyFloor?: number;
  benchmark?: { value: number; kind: BenchmarkKind };
}
interface SectionDef { key: string; label: string; weight: number; metrics: MetricDef[]; }
interface DashboardDef { key: string; label: string; question: string; sections: SectionDef[]; }

const m = (
  key: string, label: string, format: ValueFormat, visual: VisualKind,
  higherIsBetter: boolean, weight: number, what: string,
  benchmark?: { value: number; kind: BenchmarkKind }, sufficiencyFloor?: number,
): MetricDef => ({ key, label, format, visual, higherIsBetter, weight, what, benchmark, sufficiencyFloor });

// Benchmarks: absolute = a published universal standard; cohort = industry-typical
// (seeded in arion.ia_insights_benchmark); omitted = judged against the tenant's
// own trailing history (Self). Sources documented in INSIGHTS_MODEL_SPEC + the
// benchmark migration.
export const ARION_DASHBOARDS: DashboardDef[] = [
  {
    key: "search_visibility", label: "Search Visibility",
    question: "Am I found in search, and winning the searches that matter?",
    sections: [
      { key: "keyword_rankings", label: "Keyword Rankings", weight: 0.35, metrics: [
        m("kw_top10", "Keywords in Top 10", "count", "bar", true, 0.35, "Tracked keywords ranking on page one.", undefined, 2),
        m("kw_top3", "Keywords in Top 3", "count", "bar", true, 0.25, "The premium positions that capture most clicks.", undefined, 1),
        m("kw_visibility", "Visibility Score", "score", "line", true, 0.25, "SE Ranking's weighted measure of how visible you are for your tracked terms."),
        m("kw_top30", "Keywords in Top 30", "count", "line", true, 0.15, "Everything with a foothold worth improving.", undefined, 2),
      ]},
      { key: "search_traffic", label: "Search Traffic", weight: 0.35, metrics: [
        m("gsc_clicks", "Search Clicks", "number", "line", true, 0.45, "Visits earned from Google search.", undefined, 10),
        m("gsc_impressions", "Search Impressions", "number", "line", true, 0.30, "How often you appeared in search results."),
        m("bing_clicks", "Bing Clicks", "number", "line", true, 0.15, "Visits from Bing search.", undefined, 5),
        m("bing_impressions", "Bing Impressions", "number", "line", true, 0.10, "Appearances in Bing results."),
      ]},
      { key: "click_through", label: "Click-Through", weight: 0.20, metrics: [
        m("gsc_ctr", "Click-Through Rate", "percent", "gauge", true, 0.6, "Of everyone who saw you, how many clicked.", { value: 2.5, kind: "cohort" }),
        m("gsc_avg_position", "Average Position", "position", "line", false, 0.4, "Where you typically rank; lower is better.", { value: 8, kind: "absolute" }),
      ]},
      { key: "domain_authority", label: "Domain Authority", weight: 0.10, metrics: [
        m("referring_domains", "Referring Domains", "count", "line", true, 0.6, "Distinct sites linking to you — the strongest ranking signal.", undefined, 5),
        m("backlinks", "Total Backlinks", "number", "line", true, 0.4, "Total inbound links."),
      ]},
    ],
  },
  {
    key: "local_presence", label: "Local Presence",
    question: "Am I found and trusted locally?",
    sections: [
      { key: "discovery", label: "Discovery", weight: 0.25, metrics: [
        m("gbp_impressions", "Profile Views", "number", "line", true, 0.6, "How often your Google Business Profile was shown."),
        m("gbp_impr_maps", "Maps Views", "number", "line", true, 0.2, "Views from Google Maps — high local intent."),
        m("gbp_impr_search", "Search Views", "number", "line", true, 0.2, "Views from Google Search."),
      ]},
      { key: "customer_actions", label: "Customer Actions", weight: 0.35, metrics: [
        m("gbp_action_rate", "Action Rate", "percent", "gauge", true, 0.4, "Of everyone who found you, how many called, got directions, or clicked through.", { value: 5, kind: "cohort" }),
        m("gbp_calls", "Calls", "count", "line", true, 0.25, "Calls placed straight from your listing.", undefined, 3),
        m("gbp_directions", "Direction Requests", "count", "line", true, 0.2, "People asking Google how to reach you.", undefined, 3),
        m("gbp_website_clicks", "Website Clicks", "count", "line", true, 0.15, "Clicks from your listing to your site.", undefined, 5),
      ]},
      { key: "reputation", label: "Reputation", weight: 0.30, metrics: [
        m("gbp_rating", "Average Rating", "rating", "gauge", true, 0.4, "Your star rating — the first thing a local customer sees.", { value: 4.5, kind: "absolute" }),
        m("gbp_review_velocity", "Review Velocity", "count", "bar", true, 0.3, "New reviews per month; a steady flow signals an active business.", { value: 4, kind: "cohort" }, 1),
        m("gbp_response_rate", "Response Rate", "percent", "gauge", true, 0.3, "How many reviews you reply to — a published Google quality signal.", { value: 75, kind: "absolute" }),
      ]},
      { key: "profile_activity", label: "Profile Activity", weight: 0.10, metrics: [
        m("gbp_posts", "Posts Published", "count", "bar", true, 1.0, "GBP posts this month; posts decay after a week, so cadence matters.", { value: 4, kind: "cohort" }, 1),
      ]},
    ],
  },
  {
    key: "audience_conversion", label: "Audience & Conversion",
    question: "Do the right people arrive, and do they act?",
    sections: [
      { key: "traffic_volume", label: "Traffic Volume", weight: 0.20, metrics: [
        m("ga_sessions", "Sessions", "number", "line", true, 0.5, "Total visits to your site."),
        m("ga_users", "Users", "number", "line", true, 0.3, "Distinct people who visited."),
        m("ga_new_users", "New Users", "number", "line", true, 0.2, "First-time visitors — new demand."),
      ]},
      { key: "engagement_quality", label: "Engagement Quality", weight: 0.30, metrics: [
        m("ga_engagement_rate", "Engagement Rate", "percent", "gauge", true, 0.4, "Visitors who actually did something instead of leaving.", { value: 55, kind: "cohort" }),
        m("ga_bounce_rate", "Bounce Rate", "percent", "gauge", false, 0.25, "Visitors who left without engaging.", { value: 45, kind: "cohort" }),
        m("ga_avg_duration", "Avg Session Duration", "number", "line", true, 0.2, "How long visitors stay, in seconds.", { value: 90, kind: "cohort" }),
        m("ga_pages_per_session", "Pages / Session", "number", "line", true, 0.15, "How much of the site people explore."),
      ]},
      { key: "audience_mix", label: "Audience Mix", weight: 0.15, metrics: [
        m("ga_mobile_share", "Mobile Share", "percent", "donut", true, 0.5, "Share of visitors on a phone — it changes what to optimise."),
        m("ga_returning_share", "Returning Share", "percent", "donut", true, 0.5, "Share of visitors coming back."),
      ]},
      { key: "conversions", label: "Conversions", weight: 0.35, metrics: [
        m("ga_conversion_rate", "Conversion Rate", "percent", "gauge", true, 0.45, "Share of visits that became an enquiry — the number that becomes revenue.", { value: 2.5, kind: "cohort" }),
        m("form_submissions", "Form Submissions", "count", "line", true, 0.35, "Enquiries submitted through your forms.", undefined, 3),
        m("ga_conversions", "Total Conversions", "count", "line", true, 0.2, "All tracked conversion events.", undefined, 3),
      ]},
    ],
  },
  {
    key: "content", label: "Content",
    question: "Is my content earning its place?",
    sections: [
      { key: "page_performance", label: "Page Performance", weight: 0.40, metrics: [
        m("content_pageviews", "Page Views", "number", "line", true, 0.5, "Total content views."),
        m("content_engaged_pages", "Engaged Pages", "count", "line", true, 0.3, "Pages actually earning engagement.", undefined, 2),
        m("content_top_page_share", "Top-Page Concentration", "percent", "donut", false, 0.2, "Share of traffic on your single top page — high concentration is fragile."),
      ]},
      { key: "content_freshness", label: "Content Freshness", weight: 0.20, metrics: [
        m("content_fresh_ratio", "Fresh Content Ratio", "percent", "gauge", true, 0.6, "Share of pages updated in the last 90 days.", { value: 40, kind: "cohort" }),
        m("content_avg_age_days", "Average Content Age", "number", "line", false, 0.4, "Average days since a page was updated."),
      ]},
      { key: "content_quality", label: "Content Quality", weight: 0.25, metrics: [
        m("content_rankmath_avg", "Avg SEO Score", "score", "gauge", true, 0.5, "Average RankMath on-page SEO score.", { value: 80, kind: "absolute" }),
        m("content_avg_words", "Average Depth", "number", "line", true, 0.3, "Average words per page.", { value: 800, kind: "cohort" }),
        m("content_thin_ratio", "Thin Content", "percent", "gauge", false, 0.2, "Share of pages too short to rank or convince.", { value: 15, kind: "cohort" }),
      ]},
      { key: "content_gaps", label: "Content Gaps", weight: 0.15, metrics: [
        m("content_gap_count", "Open Content Gaps", "count", "bar", false, 1.0, "Searches you get impressions for with no page that answers them."),
      ]},
    ],
  },
  {
    key: "technical", label: "Technical & Site Health",
    question: "Is the foundation solid, and what's it costing me?",
    sections: [
      { key: "speed_cwv", label: "Speed & Core Web Vitals", weight: 0.35, metrics: [
        m("psi_mobile_perf", "Mobile Performance", "score", "gauge", true, 0.3, "Google PageSpeed score on mobile.", { value: 90, kind: "absolute" }),
        m("cwv_pass", "Core Web Vitals Pass", "score", "gauge", true, 0.25, "Whether you pass Google's real-world speed & stability bar.", { value: 100, kind: "absolute" }),
        m("lcp_ms", "Largest Contentful Paint", "ms", "line", false, 0.2, "How long the main content takes to load.", { value: 2500, kind: "absolute" }),
        m("psi_desktop_perf", "Desktop Performance", "score", "gauge", true, 0.15, "PageSpeed score on desktop.", { value: 90, kind: "absolute" }),
        m("cls", "Layout Shift", "number", "line", false, 0.1, "How much the page jumps while loading.", { value: 0.1, kind: "absolute" }),
      ]},
      { key: "health_seo", label: "Health & SEO Compliance", weight: 0.25, metrics: [
        m("psi_accessibility", "Accessibility", "score", "gauge", true, 0.35, "How usable your site is for everyone.", { value: 90, kind: "absolute" }),
        m("psi_seo", "Technical SEO", "score", "gauge", true, 0.25, "PageSpeed's technical-SEO score.", { value: 90, kind: "absolute" }),
        m("audit_errors", "Audit Errors", "count", "bar", false, 0.25, "Critical issues found by the site audit."),
        m("audit_warnings", "Audit Warnings", "count", "line", false, 0.15, "Non-critical issues to clean up."),
      ]},
      { key: "security", label: "Security", weight: 0.25, metrics: [
        m("security_vulns", "Known Vulnerabilities", "count", "bar", false, 0.45, "Unpatched security holes.", { value: 0, kind: "absolute" }),
        m("security_blocked", "Threats Blocked", "number", "line", true, 0.2, "Attacks stopped by your firewall."),
        m("ssl_valid", "SSL Valid", "score", "stat", true, 0.35, "Whether your certificate is valid.", { value: 100, kind: "absolute" }),
      ]},
      { key: "crawl", label: "Crawl & Indexation", weight: 0.15, metrics: [
        m("indexable_pages", "Indexable Pages", "count", "line", true, 0.4, "Pages Google can index."),
        m("broken_links", "Broken Links", "count", "bar", false, 0.35, "Dead links hurting users and crawl.", { value: 0, kind: "absolute" }),
        m("redirects", "Redirects", "count", "line", false, 0.25, "Redirect chains slowing crawl."),
      ]},
    ],
  },
  {
    key: "social_presence", label: "Social Presence",
    question: "Is my brand growing socially?",
    sections: [
      { key: "reach", label: "Reach", weight: 0.35, metrics: [
        m("social_reach", "Reach", "number", "line", true, 0.6, "Distinct people who saw your posts."),
        m("social_impressions", "Impressions", "number", "line", true, 0.4, "Total times your posts were shown."),
      ]},
      { key: "engagement", label: "Engagement", weight: 0.35, metrics: [
        m("social_engagement_rate", "Engagement Rate", "percent", "gauge", true, 0.6, "Share of reach that liked, commented or shared.", { value: 2, kind: "cohort" }),
        m("social_engagements", "Total Engagements", "count", "line", true, 0.4, "Likes, comments and shares.", undefined, 5),
      ]},
      { key: "audience_growth", label: "Audience Growth", weight: 0.30, metrics: [
        m("social_followers", "Followers", "number", "line", true, 0.5, "Your total audience."),
        m("social_follower_growth", "Follower Growth", "percent", "line", true, 0.3, "Month-over-month audience change."),
        m("social_posts", "Posts Published", "count", "bar", true, 0.2, "Posts this month; cadence drives reach.", { value: 8, kind: "cohort" }, 1),
      ]},
    ],
  },
];

// ── Metric payload from GET /arion/insights/metrics ──
export interface MetricsPayload {
  source: "demo" | "prod";
  months: string[];
  metrics: Record<string, Array<number | null>>;
  detail?: import("./detail").DetailPayload;
  /** Researched industry benchmarks (metric_key → p50), resolved server-side
   *  through the detail→medium→high→default ladder. Overrides catalog
   *  defaults in buildDashboards. */
  benchmarks?: Record<string, number>;
}

/** Build all six scored dashboards from the monthly-series payload. */
export function buildArionDashboards(payload: MetricsPayload): DashboardScore[] {
  const M = payload?.metrics || {};
  return ARION_DASHBOARDS.map((dash): DashboardScore => {
    const input: DashboardInput = {
      key: dash.key, label: dash.label,
      sections: dash.sections.map((sec) => ({
        key: sec.key, label: sec.label, weight: sec.weight,
        dataPoints: sec.metrics.map((mm): DataPointInput => {
          const series = M[mm.key];
          const unmeasured = !series || series.every((v) => v == null)
            ? unmeasuredFor(dash.key)
            : undefined;
          return {
            key: mm.key, label: mm.label, what: mm.what,
            series: series || [null], higherIsBetter: mm.higherIsBetter,
            format: mm.format, visual: mm.visual, weight: mm.weight,
            sufficiencyFloor: mm.sufficiencyFloor,
            benchmark: mm.benchmark as Benchmark | undefined,
            unmeasured,
          };
        }),
      })),
    };
    return scoreDashboard(input);
  });
}

/** Connect message per dashboard when its source has no data. */
function unmeasuredFor(dashKey: string): { reason: string; kind: "connect" | "plan" } {
  switch (dashKey) {
    case "search_visibility": return { reason: "Connect Google Search Console to see your search visibility.", kind: "connect" };
    case "local_presence":    return { reason: "Connect your Google Business Profile to see your local presence.", kind: "connect" };
    case "audience_conversion": return { reason: "Connect Google Analytics to see who visits and what they do.", kind: "connect" };
    case "content":           return { reason: "Connect Analytics or install the IA plugin to measure content.", kind: "connect" };
    case "technical":         return { reason: "Install the IA plugin to track performance and security.", kind: "connect" };
    case "social_presence":   return { reason: "Connect your social accounts in My Brand to track brand reach.", kind: "connect" };
    default: return { reason: "Not connected yet.", kind: "connect" };
  }
}

export const ARION_MONTH_LABEL = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
};
