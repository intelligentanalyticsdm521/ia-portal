// SparkEngineDocsPage — Documentation for the IA Insights trend engines (v6.3).
//
// Explains, per report, the business question, what data the engine consumes,
// how each score input is weighted, and how the final 0-100 score is computed.
// Lets tenants reason about their scores instead of treating them as a black box.
import { useState } from "react";
import { SparkPageShell } from "../../components/spark/SparkPageShell";
import {
  Eye, Users, Target, Search as SearchIcon, FileText, MapPin, ShieldCheck, Award,
  Activity, Mail, BarChart3, PieChart, Repeat, AlertCircle, DollarSign,
  Wrench, Briefcase, UserCheck, Layers, Sun,
  ChevronDown, ChevronRight,
} from "lucide-react";

interface ScoreInput {
  key: string;
  weight: number;
  source: string;
  benchmark?: string;
}

interface EngineDoc {
  key: string;
  label: string;
  question: string;
  icon: typeof Eye;
  weight: number;            // weight in the synthesis (per the handoff doc)
  product: "ARION" | "SPARK" | "OLIVER";
  description: string;
  scoreInputs: ScoreInput[];
}

const ARION_ENGINES: EngineDoc[] = [
  { key: "visibility", label: "Visibility & Reach", question: "Are people finding me?", icon: Eye, weight: 0.20, product: "ARION",
    description: "Top-of-funnel. Pulls GA4 sessions + GSC impressions + GBP visibility + Bing impressions; performs a geographic relevance check against the tenant's configured service area (Singapore-traffic detection).",
    scoreInputs: [
      { key: "impression_to_visit", weight: 0.40, source: "GSC impressions ÷ GA4 sessions, recomputed using local-only when geo data is available", benchmark: "Per service category from arion.ia_insights_benchmark" },
      { key: "local_traffic_share", weight: 0.25, source: "GA4 country/city breakdown vs tenant service_area_json" },
      { key: "channel_diversity", weight: 0.20, source: "1 - max(channel share) across GA4 channels" },
      { key: "non_brand_impressions", weight: 0.15, source: "GSC queries that don't match brand/keyword patterns" },
    ] },
  { key: "audience", label: "Audience Intelligence", question: "Who is actually visiting?", icon: Users, weight: 0.10, product: "ARION",
    description: "Quality of traffic. Session duration × pages per session, bounce rate, mobile share alignment, new/returning balance.",
    scoreInputs: [
      { key: "session_quality", weight: 0.35, source: "avg_session_duration × pages_per_session", benchmark: "avg_session_duration baseline by service category" },
      { key: "bounce_rate", weight: 0.25, source: "GA4 summary.bounceRate" },
      { key: "mobile_share", weight: 0.20, source: "GA4 device breakdown", benchmark: "mobile_share by service category (60% home services, 70% health)" },
      { key: "new_returning_balance", weight: 0.20, source: "GA4 newUsers vs totalUsers ratio" },
    ] },
  { key: "conversion", label: "Conversion Intelligence", question: "Where does my funnel break?", icon: Target, weight: 0.20, product: "ARION",
    description: "Bottom-of-funnel. Visit → form view → form start → form submit → contact created (SPARK closed loop). Identifies the largest drop-off step.",
    scoreInputs: [
      { key: "visit_to_submit", weight: 0.35, source: "form_submissions ÷ total sessions", benchmark: "form_conversion_rate per service category" },
      { key: "form_completion", weight: 0.25, source: "form_submits ÷ form_starts" },
      { key: "cta_placement", weight: 0.20, source: "form_views ÷ sessions" },
      { key: "form_to_contact", weight: 0.20, source: "SPARK closed-loop rate (locked when SPARK not connected)" },
    ] },
  { key: "search", label: "Search Intelligence", question: "Am I winning the searches that matter?", icon: SearchIcon, weight: 0.15, product: "ARION",
    description: "Query-level opportunity analysis. CTR vs benchmark, position clustering, quick-win identification (positions 11-20), brand vs non-brand balance.",
    scoreInputs: [
      { key: "avg_position", weight: 0.35, source: "GSC avgPosition (lower is better)" },
      { key: "ctr_vs_benchmark", weight: 0.25, source: "Actual CTR ÷ expected CTR for current position" },
      { key: "quick_win_count", weight: 0.20, source: "GSC queries at position 11-20 with ≥50 impressions" },
      { key: "non_brand_balance", weight: 0.20, source: "Share of GSC queries that aren't brand variants" },
    ] },
  { key: "content", label: "Content Intelligence", question: "Is my content earning its place?", icon: FileText, weight: 0.12, product: "ARION",
    description: "Page-level performance ranking. Engagement %, thin-content ratio, content gaps (queries impressions but no matching page), and depth.",
    scoreInputs: [
      { key: "engagement_pct", weight: 0.30, source: "Pages meeting engagement bar ÷ total pages" },
      { key: "thin_content_ratio", weight: 0.25, source: "Pages with <5 views and <10% engagement" },
      { key: "content_gap_count", weight: 0.20, source: "GSC queries with position >30 and ≥20 impressions" },
      { key: "avg_post_depth", weight: 0.25, source: "Plugin word-count average" },
    ] },
  { key: "local", label: "Local Presence & Reputation", question: "Do I look trustworthy locally?", icon: MapPin, weight: 0.15, product: "ARION",
    description: "Trust signal composite. GBP completeness, review velocity trend, response rate, average rating. Frame is 'what a prospect Googling you sees'.",
    scoreInputs: [
      { key: "completeness", weight: 0.20, source: "GBP profile completeness %" },
      { key: "review_velocity_trend", weight: 0.25, source: "Last-30 vs last-60 vs last-90 day review counts → accelerating/flat/declining" },
      { key: "response_rate", weight: 0.25, source: "Owner-responded reviews ÷ total reviews", benchmark: "gbp_response_rate baseline (75% home services, 85% health)" },
      { key: "rating", weight: 0.30, source: "GBP average rating", benchmark: "gbp_avg_rating (4.5 home services, 4.7 legal)" },
    ] },
  { key: "technical", label: "Technical & Site Health", question: "Is the foundation solid?", icon: ShieldCheck, weight: 0.08, product: "ARION",
    description: "Translates technical issues to business impact. Mobile PageSpeed + CWV + Wordfence + plugin currency.",
    scoreInputs: [
      { key: "mobile_perf", weight: 0.30, source: "Latest PageSpeed mobile score" },
      { key: "security_score", weight: 0.25, source: "Wordfence overall_score or vulnerability count" },
      { key: "cwv_score", weight: 0.25, source: "LCP + CLS thresholds", benchmark: "cwv_mobile_lcp_ms (2500ms target)" },
      { key: "plugins_updates", weight: 0.20, source: "Outdated plugin count" },
    ] },
  { key: "presence", label: "Business Presence Score", question: "Synthesis: complete online presence?", icon: Award, weight: 0, product: "ARION",
    description: "The ARION Trend Score shown in the 4-gauge header. Weighted composite of the other 7 reports. NOT a separate card — its content becomes the drill-down from the Trend gauge.",
    scoreInputs: [
      { key: "visibility", weight: 0.20, source: "Visibility & Reach score" },
      { key: "conversion", weight: 0.20, source: "Conversion Intelligence score" },
      { key: "search", weight: 0.15, source: "Search Intelligence score" },
      { key: "local", weight: 0.15, source: "Local Presence score" },
      { key: "content", weight: 0.12, source: "Content Intelligence score" },
      { key: "audience", weight: 0.10, source: "Audience Intelligence score" },
      { key: "technical", weight: 0.08, source: "Technical & Site Health score" },
    ] },
];

const SPARK_ENGINES: EngineDoc[] = [
  { key: "contact_health", label: "Contact Health", question: "Is my contact base growing, active, and clean?", icon: Users, weight: 0.15, product: "SPARK",
    description: "Growth rate + email/phone coverage + opt-out cleanliness.",
    scoreInputs: [
      { key: "growth_rate", weight: 0.35, source: "New contacts ÷ active contacts over the period", benchmark: "contact_growth_rate_pct (5%)" },
      { key: "email_coverage", weight: 0.25, source: "Contacts with email ÷ active contacts" },
      { key: "phone_coverage", weight: 0.20, source: "Contacts with phone ÷ active contacts" },
      { key: "list_cleanliness", weight: 0.20, source: "SMS opt-outs ÷ phone-having contacts (inverted)" },
    ] },
  { key: "lead_pipeline", label: "Lead Pipeline", question: "Funnel health + win rate?", icon: Activity, weight: 0.18, product: "SPARK",
    description: "Volume + qualification rate + win rate + leak rate.",
    scoreInputs: [
      { key: "lead_volume", weight: 0.25, source: "Total leads this period" },
      { key: "win_rate_pct", weight: 0.30, source: "Won ÷ (won + lost)", benchmark: "lead_win_rate_pct (30% home services, 35% legal)" },
      { key: "qualification_rate_pct", weight: 0.25, source: "Qualified ÷ new" },
      { key: "leak_rate_pct", weight: 0.20, source: "Lost ÷ total (inverted)" },
    ] },
  { key: "campaign_perf", label: "Campaign Performance", question: "Engagement + booking impact?", icon: Mail, weight: 0.15, product: "SPARK",
    description: "Open rate + click rate + click-to-open + list-hygiene composite.",
    scoreInputs: [
      { key: "open_rate_pct", weight: 0.30, source: "Opens ÷ delivered", benchmark: "email_open_rate_pct (22% home services)" },
      { key: "click_rate_pct", weight: 0.30, source: "Clicks ÷ delivered", benchmark: "email_click_rate_pct (3.5%)" },
      { key: "click_to_open_pct", weight: 0.20, source: "Clicks ÷ opens" },
      { key: "list_hygiene_pct", weight: 0.20, source: "100 - (bounce + unsub rate weighting)" },
    ] },
  { key: "marketing_attrib", label: "Marketing Attribution", question: "Channels producing best customers?", icon: BarChart3, weight: 0.12, product: "SPARK",
    description: "Channel diversity + sourced contact volume.",
    scoreInputs: [
      { key: "channel_diversity", weight: 0.55, source: "Number of active contact.source values" },
      { key: "total_sourced_contacts", weight: 0.45, source: "Sum of contacts with a source attribution" },
    ] },
  { key: "segmentation", label: "Customer Segmentation", question: "Who are my best customers?", icon: PieChart, weight: 0.10, product: "SPARK",
    description: "Segment coverage + variety + tag depth.",
    scoreInputs: [
      { key: "segment_coverage", weight: 0.45, source: "Contacts in any segment ÷ active contacts" },
      { key: "segment_count", weight: 0.30, source: "Number of defined segments" },
      { key: "tag_depth", weight: 0.25, source: "Number of distinct tags applied" },
    ] },
  { key: "automation_eff", label: "Automation Effectiveness", question: "Are automations working?", icon: Repeat, weight: 0.10, product: "SPARK",
    description: "Active rate + execs per automation + active count.",
    scoreInputs: [
      { key: "active_rate_pct", weight: 0.30, source: "Active automations ÷ total" },
      { key: "execs_per_automation", weight: 0.40, source: "Total executions ÷ active automation count" },
      { key: "active_automation_count", weight: 0.30, source: "Number of active automations" },
    ] },
  { key: "retention_risk", label: "Retention Risk", question: "Who's going quiet?", icon: AlertCircle, weight: 0.10, product: "SPARK",
    description: "Lead-score distribution across the contact base.",
    scoreInputs: [
      { key: "high_score_ratio_pct", weight: 0.40, source: "Contacts with lead_score ≥70 ÷ scored" },
      { key: "low_score_ratio_pct", weight: 0.25, source: "Contacts with lead_score <30 ÷ scored (inverted)" },
      { key: "scored_contacts", weight: 0.35, source: "Total contacts with a lead_score" },
    ] },
  { key: "revenue_attrib", label: "Revenue Attribution", question: "Where does SPARK revenue come from?", icon: DollarSign, weight: 0.10, product: "SPARK",
    description: "Total attributed LTV + revenue diversity + avg LTV per customer.",
    scoreInputs: [
      { key: "total_attributed_ltv", weight: 0.40, source: "Sum of contact.lifetime_value with a source" },
      { key: "revenue_diversity", weight: 0.30, source: "Number of revenue sources tracked" },
      { key: "avg_ltv", weight: 0.30, source: "Total LTV ÷ contacts with attribution" },
    ] },
];

const OLIVER_ENGINES: EngineDoc[] = [
  { key: "ops_health", label: "Operations Health", question: "Jobs completed efficiently + on time?", icon: Wrench, weight: 0.18, product: "OLIVER",
    description: "Completion + on-time + cancel rate + avg completion hours.",
    scoreInputs: [
      { key: "completion_rate_pct", weight: 0.30, source: "Completed jobs ÷ all jobs" },
      { key: "on_time_rate_pct", weight: 0.35, source: "On-time ÷ (on-time + late)", benchmark: "on_time_completion_pct (80% home services)" },
      { key: "cancel_rate_pct", weight: 0.20, source: "Cancelled ÷ total (inverted)" },
      { key: "avg_completion_hours", weight: 0.15, source: "Mean(completed_date − scheduled_date) in hours" },
    ] },
  { key: "revenue_perf", label: "Revenue Performance", question: "Revenue trending + drivers?", icon: DollarSign, weight: 0.18, product: "OLIVER",
    description: "Revenue + paid rate + overdue rate + invoice volume.",
    scoreInputs: [
      { key: "revenue", weight: 0.40, source: "Sum invoice.amount_paid this period" },
      { key: "paid_rate_pct", weight: 0.25, source: "Paid invoices ÷ total", benchmark: "paid_invoice_rate_pct (75%)" },
      { key: "overdue_rate_pct", weight: 0.15, source: "Overdue invoices ÷ total (inverted)" },
      { key: "invoice_count", weight: 0.20, source: "Total invoices issued" },
    ] },
  { key: "cash_flow", label: "Cash Flow", question: "Money timing + pressure?", icon: BarChart3, weight: 0.15, product: "OLIVER",
    description: "Collection ratio + days-late + payment volume.",
    scoreInputs: [
      { key: "collection_ratio_pct", weight: 0.50, source: "Payments in ÷ revenue invoiced" },
      { key: "avg_days_late", weight: 0.30, source: "Mean(payment_date − due_date), inverted" },
      { key: "payment_count", weight: 0.20, source: "Number of payments" },
    ] },
  { key: "quote_win_rate", label: "Quote & Win Rate", question: "Quote → booked work conversion?", icon: Briefcase, weight: 0.12, product: "OLIVER",
    description: "Win rate + quote volume + pipeline value.",
    scoreInputs: [
      { key: "win_rate_pct", weight: 0.50, source: "Accepted ÷ (accepted + rejected)", benchmark: "quote_win_rate_pct (45%)" },
      { key: "quote_volume", weight: 0.20, source: "Total quotes issued" },
      { key: "pipeline_value", weight: 0.30, source: "Sum draft-quote total_amount" },
    ] },
  { key: "retention", label: "Customer Retention", question: "Who's at risk + recovery value?", icon: UserCheck, weight: 0.10, product: "OLIVER",
    description: "At-risk rate + repeat-job rate.",
    scoreInputs: [
      { key: "at_risk_rate_pct", weight: 0.55, source: "Customers >60 days since last job (inverted)" },
      { key: "avg_jobs_per_customer", weight: 0.45, source: "Total jobs ÷ distinct customers", benchmark: "repeat_jobs_per_customer (2)" },
    ] },
  { key: "crew_capacity", label: "Crew & Capacity", question: "Crew utilisation + resourcing?", icon: Users, weight: 0.10, product: "OLIVER",
    description: "Avg jobs per worker + active worker count.",
    scoreInputs: [
      { key: "avg_jobs_per_worker", weight: 0.60, source: "Total assignments ÷ workers with any assignment" },
      { key: "active_workers", weight: 0.40, source: "Distinct workers with assignments this period" },
    ] },
  { key: "service_line", label: "Service Line Performance", question: "Which services drive profit?", icon: Layers, weight: 0.10, product: "OLIVER",
    description: "Service type diversity + total revenue mix.",
    scoreInputs: [
      { key: "service_type_count", weight: 0.50, source: "Distinct service_type values in jobs" },
      { key: "total_revenue", weight: 0.50, source: "Sum of job.total_amount" },
    ] },
  { key: "seasonal", label: "Seasonal Planning", question: "Demand cycle awareness?", icon: Sun, weight: 0.07, product: "OLIVER",
    description: "Months of data + peak-to-low job ratio (stability).",
    scoreInputs: [
      { key: "months_with_data", weight: 0.50, source: "Distinct months in last 12-month job history" },
      { key: "peak_to_low_ratio", weight: 0.50, source: "Peak month jobs ÷ low month jobs (inverted)" },
    ] },
];

const TABS: Array<{ key: "ARION" | "SPARK" | "OLIVER"; label: string; engines: EngineDoc[] }> = [
  { key: "ARION", label: "ARION (8 reports)", engines: ARION_ENGINES },
  { key: "SPARK", label: "SPARK (8 reports)", engines: SPARK_ENGINES },
  { key: "OLIVER", label: "OLIVER (8 reports)", engines: OLIVER_ENGINES },
];

const BAND_COLORS = { green: "#16A34A", amber: "#EAB308", red: "#DC2626" };

export function SparkEngineDocsPage() {
  const [tab, setTab] = useState<"ARION" | "SPARK" | "OLIVER">("ARION");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const engines = TABS.find((t) => t.key === tab)!.engines;
  const totalWeight = engines.reduce((s, e) => s + e.weight, 0);

  return (
    <SparkPageShell
      title="IA Insights Engine Documentation"
      subtitle="How each trend report's score is computed"
      help="Per-report reference for the analytical engines behind every Trend Score. Each engine reads specific data sources, weights its inputs, and produces a 0-100 score. Bands: green ≥70, amber 50-69, red <50."
    >
      <div className="mb-3 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px ${tab === t.key ? "border-[#EF6C33] text-[#EF6C33] font-semibold" : "border-transparent text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 mb-3">
        <strong>Synthesis weighting:</strong> The {tab} Trend Score is a weighted composite of the 8 reports below.
        Total weight sums to {Math.round(totalWeight * 100)}% (the synthesis "presence" report itself doesn't contribute weight; it IS the composite).
        Industry benchmarks for the inputs marked "benchmark:" come from <code className="font-mono">arion.ia_insights_benchmark</code> and switch automatically per the tenant's <strong>service_category</strong> setting.
      </div>

      {engines.map((e) => {
        const Icon = e.icon;
        const isExpanded = !!expanded[e.key];
        return (
          <div key={e.key} className="rounded-lg border border-slate-200 bg-white mb-2 overflow-hidden">
            <button
              onClick={() => setExpanded((c) => ({ ...c, [e.key]: !c[e.key] }))}
              className="w-full px-4 py-3 flex items-start justify-between gap-2 hover:bg-slate-50 text-left"
            >
              <div className="flex items-start gap-2 min-w-0 flex-1">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5" /> : <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5" />}
                <Icon className="h-4 w-4 text-[#EF6C33] mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-900">{e.label}</span>
                    {e.weight > 0 && (
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                        {Math.round(e.weight * 100)}% synthesis weight
                      </span>
                    )}
                    {e.weight === 0 && (
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                        Synthesis report
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5"><em>{e.question}</em></div>
                </div>
              </div>
            </button>
            {isExpanded && (
              <div className="border-t border-slate-200 px-4 py-3">
                <div className="text-xs text-slate-700 mb-3">{e.description}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-500 tracking-wide mb-2">Score inputs</div>
                <div className="space-y-2">
                  {e.scoreInputs.map((s) => (
                    <div key={s.key} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <code className="font-mono text-slate-900">{s.key}</code>
                        <span className="text-[10px] font-semibold text-slate-700 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                          {Math.round(s.weight * 100)}% weight
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-700">{s.source}</div>
                      {s.benchmark && (
                        <div className="text-[10px] text-slate-500 mt-1"><strong>Benchmark:</strong> {s.benchmark}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-3 text-xs">
        <div className="font-semibold text-slate-900 mb-1">Score bands</div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS.green }} /> <span className="text-slate-700">≥70 (healthy)</span></div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS.amber }} /> <span className="text-slate-700">50-69 (room to improve)</span></div>
          <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BAND_COLORS.red }} /> <span className="text-slate-700">&lt;50 (action needed)</span></div>
        </div>
      </div>
    </SparkPageShell>
  );
}

export default SparkEngineDocsPage;
