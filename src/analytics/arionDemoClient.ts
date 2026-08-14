// arionDemoClient.ts — client-side ARION demo series (for the ARGUS roll-up).
//
// The ARION Trends page itself fetches from GET /arion/insights/metrics. But the
// ARGUS cross-platform view needs ARION's scores alongside SPARK/OLIVER without
// a network round-trip per platform, so it uses this client generator instead.
// The base values mirror arion-api/lib/arionMetrics.js so the two stay close.

import { buildDemoPayload, type SeriesSpec } from "./demoSeries";
import type { MetricsPayload } from "./arionDashboards";

export function demoArionMetricsClient(seed: string): MetricsPayload {
  const specs: Record<string, SeriesSpec> = {
    gsc_impressions:  { base: 3200, drift: 0.03, dir: 1, integer: true, noise: 0.08 },
    gsc_clicks:       { base: 105, drift: 0.03, dir: 1, integer: true, noise: 0.08 },
    gsc_avg_position: { base: 14, drift: -0.012, noise: 0.04, min: 1 },
    kw_tracked:       { base: 25, drift: 0.01, noise: 0.01, integer: true },
    kw_top3:          { base: 3, drift: 0.05, dir: 1, integer: true, noise: 0.15 },
    kw_top10:         { base: 8, drift: 0.04, dir: 1, integer: true, noise: 0.1 },
    kw_top30:         { base: 16, drift: 0.02, integer: true, noise: 0.06 },
    kw_visibility:    { base: 34, drift: 0.03, dir: 1, noise: 0.05 },
    bing_impressions: { base: 420, drift: 0.02, integer: true },
    bing_clicks:      { base: 12, drift: 0.02, integer: true },
    backlinks:        { base: 180, drift: 0.02, noise: 0.03, integer: true },
    referring_domains:{ base: 42, drift: 0.02, noise: 0.03, integer: true },
    gbp_impressions:  { base: 5200, drift: 0.025, dir: 1, integer: true },
    gbp_calls:        { base: 62, drift: 0.02, integer: true },
    gbp_directions:   { base: 88, drift: 0.02, integer: true },
    gbp_website_clicks:{ base: 140, drift: 0.03, dir: 1, integer: true },
    gbp_rating:       { base: 4.4, drift: 0.001, noise: 0.01, max: 5 },
    gbp_review_count: { base: 42, drift: 0.02, noise: 0.01, integer: true },
    gbp_review_velocity:{ base: 3, drift: 0.01, noise: 0.2, dir: -1, integer: true },
    gbp_response_rate:{ base: 68, drift: 0.02, noise: 0.04, dir: 1, max: 100 },
    gbp_posts:        { base: 4, drift: 0.01, noise: 0.3, dir: -1, integer: true },
    ga_sessions:      { base: 2100, drift: 0.03, dir: 1, integer: true },
    ga_users:         { base: 1760, drift: 0.03, dir: 1, integer: true },
    ga_new_users:     { base: 1100, drift: 0.03, dir: 1, integer: true },
    ga_engagement_rate:{ base: 55, drift: 0.005, noise: 0.03, dir: 1, max: 100 },
    ga_avg_duration:  { base: 96, drift: 0.01, noise: 0.06, integer: true },
    ga_pages_per_session:{ base: 2.1, drift: 0.005, noise: 0.05 },
    ga_mobile_share:  { base: 62, drift: 0.003, noise: 0.02, max: 100 },
    ga_returning_share:{ base: 38, drift: 0.004, noise: 0.03, max: 100 },
    ga_conversions:   { base: 38, drift: 0.03, dir: 1, integer: true },
    form_submissions: { base: 26, drift: 0.03, dir: 1, integer: true },
    content_pageviews:{ base: 5400, drift: 0.03, dir: 1, integer: true },
    content_top_page_share:{ base: 34, drift: -0.004, noise: 0.03, max: 100 },
    content_engaged_pages:{ base: 18, drift: 0.02, noise: 0.05, integer: true },
    content_fresh_ratio:{ base: 42, drift: 0.01, noise: 0.04, dir: -1, max: 100 },
    content_avg_age_days:{ base: 210, drift: 0.01, noise: 0.03, integer: true },
    content_avg_words:{ base: 720, drift: 0.01, noise: 0.03, integer: true },
    content_rankmath_avg:{ base: 74, drift: 0.01, noise: 0.03, dir: 1, max: 100 },
    content_thin_ratio:{ base: 22, drift: -0.01, noise: 0.05, dir: 1, max: 100 },
    content_gap_count:{ base: 14, drift: -0.01, noise: 0.08, dir: 1, integer: true },
    psi_mobile_perf:  { base: 58, drift: 0.015, noise: 0.04, dir: 1, max: 100 },
    psi_desktop_perf: { base: 82, drift: 0.008, noise: 0.02, max: 100 },
    psi_accessibility:{ base: 78, drift: 0.006, noise: 0.02, max: 100 },
    psi_seo:          { base: 92, drift: 0.003, noise: 0.01, max: 100 },
    psi_best_practices:{ base: 88, drift: 0.003, noise: 0.02, max: 100 },
    lcp_ms:           { base: 3200, drift: -0.015, noise: 0.05, dir: 1, integer: true },
    inp_ms:           { base: 220, drift: -0.01, noise: 0.06, integer: true },
    audit_errors:     { base: 12, drift: -0.02, noise: 0.08, integer: true, min: 0 },
    audit_warnings:   { base: 34, drift: -0.01, noise: 0.06, integer: true, min: 0 },
    security_vulns:   { base: 2, drift: -0.03, noise: 0.3, integer: true, min: 0 },
    security_blocked: { base: 420, drift: 0.02, noise: 0.2, integer: true },
    broken_links:     { base: 6, drift: -0.02, noise: 0.15, integer: true, min: 0 },
    redirects:        { base: 18, drift: -0.005, noise: 0.05, integer: true, min: 0 },
    indexable_pages:  { base: 42, drift: 0.01, noise: 0.02, integer: true },
  };
  return buildDemoPayload(`arion:${seed}`, specs, (M) => ({
    gsc_ctr:            M.gsc_impressions.map((im, i) => Number(((M.gsc_clicks[i] / im) * 100).toFixed(2))),
    gbp_impr_maps:      M.gbp_impressions.map((v) => Math.round(v * 0.52)),
    gbp_impr_search:    M.gbp_impressions.map((v) => Math.round(v * 0.48)),
    gbp_action_rate:    M.gbp_impressions.map((im, i) => Number((((M.gbp_calls[i] + M.gbp_directions[i] + M.gbp_website_clicks[i]) / im) * 100).toFixed(2))),
    ga_bounce_rate:     M.ga_engagement_rate.map((v) => Number((100 - v).toFixed(1))),
    ga_conversion_rate: M.ga_conversions.map((c, i) => Number(((c / M.ga_sessions[i]) * 100).toFixed(2))),
    cls:                M.lcp_ms.map(() => 0.05),
    cwv_pass:           M.lcp_ms.map((l) => (l <= 2500 ? 100 : 0)),
    ssl_valid:          M.lcp_ms.map(() => 100),
  }));
}
