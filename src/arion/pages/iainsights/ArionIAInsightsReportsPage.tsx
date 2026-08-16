// ARION → IA Insights → Reports (2026-08-14).
//
// Brandon: "all the reports should also live in the ARION>IA Insights>Reports."
//
// The catalog — every report we produce, grouped by the feature it belongs to,
// each stating the question it answers. It is the third door into the SAME
// report definition; the other two are the operational page's "See full
// details" button and the Trends / Intelligence drill-down. All three render
// `DeepReportView` off `deriveDeepReport`, so a report cannot say different
// things depending on how you reached it.
//
// This page never invents a report. It reads whatever `detail` the insights
// payload carries, so a report appears here the moment its data does — and a
// report with no data yet is shown as "collecting", not hidden and not faked.
import { useArionInsightsPayload } from "../../../hooks/useArionInsightsPayload";
import { InsightsReportsCatalog } from "../../../components/insights/InsightsReportsCatalog";
import { ARION_DASHBOARDS } from "../../../analytics/arionDashboards";

/** Feature grouping for the catalog — dashboard key → the nav feature a client
 *  recognises. Reports carry `section` as "dashboardKey.sectionKey". */
const FEATURE_LABEL: Record<string, string> = {
  technical: "Website & Site Health",
  search_visibility: "Search Visibility",
  local_presence: "Business Profile",
  audience_conversion: "Analytics",
  content: "Content",
  social_presence: "Social",
};

/** What each report answers, in the owner's words. Keyed by report id.
 *  A report with no entry still lists — it just shows its own label. */
const ANSWERS: Record<string, string> = {
  component_upkeep: "Is anyone actually looking after this site?",
  content_library: "Page by page — what is thin, stale, or competing with itself?",
  page_reachability: "Which pages can nobody actually find?",
  search_by_country: "Where in the world am I being found?",
  page_query_pairs: "What is each page actually ranking for?",
  search_appearance: "Do I earn rich results, or plain blue links?",
  audience_by_country: "Are my visitors anywhere near my service area?",
  browser_experience: "Is my site broken in somebody's browser?",
  device_os_split: "Does my site behave on iOS and Android alike?",
  new_vs_returning: "New people, or the same faces?",
  traffic_by_hour: "When should someone be answering the phone?",
  traffic_by_medium: "Which way of reaching people actually works?",
  campaign_performance: "Did that campaign pay for itself?",
  page_titles_read: "Which pages get opened and abandoned?",
  gbp_visibility_split: "Search or Maps? Phone or desktop?",
  gbp_actions: "What do people do after they find me?",
  core_web_vitals: "Am I passing what Google measures?",
  pagespeed_scores: "What does Google actually score my site?",
  pagespeed_field_data: "What did real visitors experience?",
  pagespeed_performance_audits: "What exactly is slowing the site down?",
  pagespeed_accessibility_audits: "Who cannot use my site?",
  pagespeed_seo_audits: "What can Google not read?",
  pagespeed_best_practice_audits: "Is the site being maintained properly?",
  pagespeed_opportunities: "What exactly would make my site faster?",
  media_library: "What is my media library doing to my speed?",
  keyword_movement: "Which keywords moved, and which ones matter?",
  striking_distance: "What is one push from page one?",
  query_performance: "What are people searching to find me?",
  ctr_by_query: "Where am I being seen but not clicked?",
  ctr_opportunity: "Which titles are costing me clicks I already earned?",
  trend_breaks: "What changed, and when exactly?",
  engagement_by_page: "Which landing pages lose people on arrival?",
  page_search_performance: "Which pages earn my search traffic?",
  top_pages: "What content actually gets read?",
  channel_breakdown: "Where does my traffic come from?",
  geography: "Where are my visitors?",
  conversion_by_source: "Which channels turn into enquiries?",
  gbp_search_keywords: "What did people type to find my listing?",
  referring_domains: "Who links to me?",
  competitor_rankings: "How do I compare to who I lose work to?",
  backlink_quality: "Are my links actually worth anything?",
  anchor_text_profile: "What do other sites call me?",
};

export function ArionIAInsightsReportsPage() {
  const payload = useArionInsightsPayload();

  return (
    <InsightsReportsCatalog
      product="arion"
      detail={payload?.detail}
      loading={!payload}
      dashboards={ARION_DASHBOARDS}
      featureLabel={FEATURE_LABEL}
      answers={ANSWERS}
      intro="Every report we produce for this site, grouped by the part of your presence it covers. Each one is the full analysis — the same report you reach from the page itself or by drilling into a score."
    />
  );
}

export default ArionIAInsightsReportsPage;
