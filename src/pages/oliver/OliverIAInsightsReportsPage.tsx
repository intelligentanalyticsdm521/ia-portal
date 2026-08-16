// OLIVER → IA Insights → Reports (2026-08-14).
//
// The catalog ARION had and OLIVER did not. Same gap as SPARK: the reports
// existed and were reachable from their own pages, but there was no single
// place to see everything the product produces.
import { InsightsReportsCatalog } from "../../components/insights/InsightsReportsCatalog";
import { useProductInsightsPayload } from "../../hooks/useProductInsightsPayload";
import { OLIVER_DASHBOARDS } from "../../analytics/oliverDashboards";

/** dashboard key → the feature name a client recognises. */
const FEATURE_LABEL: Record<string, string> = {
  revenue_cash: "Revenue & Cash",
  jobs_operations: "Jobs & Operations",
  sales_pipeline: "Quotes & Pipeline",
  crew_capacity: "Crew & Capacity",
  customer_retention: "Customers & Retention",
};

/** What each report answers, in the owner's words. */
const ANSWERS: Record<string, string> = {
  oliver_overdue_invoices: "Who owes me money right now?",
  oliver_invoice_aging: "How old is the money I am owed?",
  oliver_invoice_size: "What is a typical invoice worth?",
  oliver_revenue_by_service: "Which services actually make money?",
  oliver_subscription_health: "What is my recurring revenue, and who is leaving?",
  oliver_recurring_contracts: "What work repeats?",
  oliver_job_status: "Where is the work sitting?",
  oliver_jobs_by_service: "What am I doing most of?",
  oliver_booked_ahead: "How full is the calendar?",
  oliver_backlog_age: "What has been waiting too long?",
  oliver_quotes_by_service: "What am I quoting for?",
  oliver_quote_size: "What is a typical quote worth?",
  oliver_win_drivers: "What makes a quote turn into work?",
  oliver_crew_performance: "How is the crew doing?",
  oliver_top_customers: "Who is worth keeping close?",
};

export function OliverIAInsightsReportsPage() {
  const payload = useProductInsightsPayload("oliver");
  return (
    <div className="p-1">
      <InsightsReportsCatalog
        product="oliver"
        detail={payload?.detail}
        loading={!payload}
        dashboards={OLIVER_DASHBOARDS}
        featureLabel={FEATURE_LABEL}
        answers={ANSWERS}
        intro="Every report we produce for your operation, grouped by the part of the business it covers. Each one is the full analysis — the same report you reach from the page itself or by drilling into a score."
      />
    </div>
  );
}

export default OliverIAInsightsReportsPage;
