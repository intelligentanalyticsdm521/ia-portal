// SPARK → IA Insights → Reports (2026-08-14).
//
// The catalog ARION had and SPARK did not. Reports were built and wired to
// their feature pages, but with no catalog there was nowhere to browse them —
// which is exactly what Brandon hit looking for them.
import { InsightsReportsCatalog } from "../../components/insights/InsightsReportsCatalog";
import { ReportsHubPage } from "../../components/insights/ReportsHubPage";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { SPARK_DASHBOARDS } from "../../analytics/sparkDashboards";

/** dashboard key → the feature name a client recognises. */
const FEATURE_LABEL: Record<string, string> = {
  contact_health: "Contacts",
  lead_pipeline: "Leads & Pipeline",
  campaign_performance: "Campaigns",
  deliverability: "Deliverability",
  automation_retention: "Automation & Retention",
};

/** What each report answers, in the owner's words. */
const ANSWERS: Record<string, string> = {
  spark_list_health: "Who can I actually reach?",
  spark_contact_sources: "Where are my contacts coming from?",
  spark_lifecycle_stages: "Where is everyone in the journey?",
  spark_campaigns: "Which campaigns actually worked?",
  spark_send_times: "When should I send?",
  spark_bounce_domains: "Which inboxes are rejecting me?",
  spark_lead_sources: "Which sources produce real leads?",
  spark_stage_flow: "Where does the pipeline stall?",
  spark_automations: "Are my automations doing anything?",
  spark_engagement_cohorts: "Who still opens my email?",
  spark_conversion_by_source: "Which source turns into customers?",
  spark_sends_by_type: "What am I actually sending?",
};

export function SparkIAInsightsReportsPage() {
  const payload = useProductInsightsPayload("spark");
  return (
    <div className="p-1">
      <InsightsReportsCatalog
        detail={payload?.detail}
        loading={!payload}
        dashboards={SPARK_DASHBOARDS}
        featureLabel={FEATURE_LABEL}
        answers={ANSWERS}
        intro="Every report we produce for your marketing, grouped by the part of it they cover. Each one is the full analysis — the same report you reach from the page itself or by drilling into a score."
      />

      {/* The operational hub that lived here before. The analysis comes
          first because that is what someone opening "Reports" is after;
          the plain operational record stays underneath rather than being
          replaced by it. */}
      <ReportsHubPage platform="SPARK" bare />
    </div>
  );
}

export default SparkIAInsightsReportsPage;
