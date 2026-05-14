// ArgusCrossChannelPage — v9.0 ARGUS Cross-Channel section.
//
// Spec §6.4: 8 cross-channel reports grouped by product combination.
// All are v2 — require 90+ days of multi-product data. Shells launch
// June 1 with appropriate empty states.
//
// This is the only cross-channel surface. Every product's "Cross-Channel"
// nav link routes here.
import { Lock, TrendingUp, Users, Activity, DollarSign, Repeat, MessageSquare, BarChart3, ArrowRight } from "lucide-react";

interface CCReport {
  key: string;
  num: number;
  label: string;
  question: string;
  icon: typeof Users;
  dataChain: string;
}

interface ProductPair {
  label: string;
  description: string;
  reports: CCReport[];
}

const CROSS_CHANNEL_GROUPS: ProductPair[] = [
  {
    label: "ARION → SPARK",
    description: "Web acquisition + contact lifecycle",
    reports: [
      {
        key: "acquisition_quality",
        num: 1,
        label: "Acquisition Quality",
        question: "Which website channels produce the highest-LTV contacts, not just the most?",
        icon: Users,
        dataChain: "arion.site_form_submission (utm_source) → lumen.contact (source, lifetime_value) → oliver.invoice (revenue)",
      },
      {
        key: "form_to_contact",
        num: 2,
        label: "Form-to-Contact Performance",
        question: "Which specific forms on which pages are producing the best leads?",
        icon: Activity,
        dataChain: "arion.site_form_submission (form_id, page, utm) → lumen.contact + lead (conversion rate, quality score)",
      },
    ],
  },
  {
    label: "SPARK → OLIVER",
    description: "Marketing → Operations → Customer LTV",
    reports: [
      {
        key: "marketing_ops_loop",
        num: 3,
        label: "Marketing → Ops Loop",
        question: "How well does marketing output translate to booked work?",
        icon: MessageSquare,
        dataChain: "ops.email_campaign + automation → lumen.contact engagement → oliver.job (created within attribution window)",
      },
      {
        key: "clv",
        num: 4,
        label: "Customer Lifetime Value",
        question: "What is each customer segment actually worth over time?",
        icon: DollarSign,
        dataChain: "lumen.contact (RFM segment) → oliver.job + invoice (revenue history, frequency, recency)",
      },
      {
        key: "retention_revenue",
        num: 5,
        label: "Retention Revenue Recovery",
        question: "What dollar value sits in dormant customers and what would recovery require?",
        icon: Repeat,
        dataChain: "lumen.contact (last_job_date, LTV) → churn risk tier → estimated recovery value → SPARK reactivation cost",
      },
    ],
  },
  {
    label: "ARION → OLIVER",
    description: "Reputation → Conversion",
    reports: [
      {
        key: "review_sales_loop",
        num: 6,
        label: "Review → Sales Loop",
        question: "Does online reputation measurably affect job inquiry and conversion rate?",
        icon: TrendingUp,
        dataChain: "ARION review velocity + rating trend → oliver.job inquiry rate correlation → conversion rate comparison periods",
      },
    ],
  },
  {
    label: "Full Funnel (ARION + SPARK + OLIVER)",
    description: "End-to-end visit → revenue journey + composite growth",
    reports: [
      {
        key: "web_to_revenue",
        num: 7,
        label: "Web-to-Revenue Funnel",
        question: "What does the complete journey from site visit to paid job look like?",
        icon: TrendingUp,
        dataChain: "GA4 sessions → arion.site_form_submission → lumen.contact → lumen.lead → oliver.quote → oliver.job → oliver.invoice.paid",
      },
      {
        key: "growth_composite",
        num: 8,
        label: "Growth Composite",
        question: "Where is the business growing and stalling across all dimensions simultaneously?",
        icon: BarChart3,
        dataChain: "All active platform scores + trend directions + predictive signals combined into a single growth narrative",
      },
    ],
  },
];

export function ArgusCrossChannelPage() {
  // TODO v9.1: read activeProducts from AppState to hide irrelevant groups
  // and detect single-product state for activation-prompt empty state.
  const isSingleProduct = false;  // Placeholder — defaults to multi-product shell view.

  if (isSingleProduct) {
    return (
      <div className="p-4 max-w-3xl mx-auto">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">ARGUS Cross-Channel</h1>
          <p className="text-sm text-slate-500 mt-1">Insights that connect your platforms.</p>
        </div>
        <div className="rounded-lg border-2 border-dashed p-8 bg-emerald-50 border-emerald-300 text-center">
          <div className="mb-3 text-emerald-700">
            <Users className="h-12 w-12 mx-auto" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Add a second platform to unlock cross-channel insights</h2>
          <p className="text-sm text-slate-600 mb-4">Cross-channel reports connect data across ARION (web), SPARK (CRM), and OLIVER (operations) — they need at least two of these active to show meaningful patterns.</p>
          <a href="/app/pricing" className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium hover:bg-emerald-700">
            View pricing <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="mb-3">
        <h1 className="text-2xl font-bold text-slate-900">ARGUS Cross-Channel Intelligence</h1>
        <p className="text-sm text-slate-500 mt-0.5">Insights that connect your platforms — 8 reports across 4 product-pair categories.</p>
      </div>

      <div className="mb-4 rounded-md border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>v2 — all 8 reports are shells at launch.</strong> Two things have to happen before any
        report goes live: (1) the rendering engine for the cross-product join has to be built (post-launch
        work), and (2) the underlying multi-product data must accumulate to the 90+ day threshold. Cards
        show the data chain each report depends on. Reports do <em>not</em> auto-populate from data alone
        — the engine has to ship first.
      </div>

      <div className="space-y-6">
        {CROSS_CHANNEL_GROUPS.map((group) => (
          <div key={group.label}>
            <div className="mb-3 flex items-baseline gap-3">
              <h2 className="text-base font-bold text-slate-900">{group.label}</h2>
              <span className="text-xs text-slate-500">{group.description}</span>
              <span className="text-[10px] uppercase font-semibold text-slate-400 ml-auto">{group.reports.length} report{group.reports.length === 1 ? "" : "s"}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {group.reports.map((r) => (
                <div key={r.key} className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-shrink-0 h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#84CC1620", color: "#A3E635" }}>
                      <r.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400">#{r.num}</span>
                        <span className="font-semibold text-sm text-slate-900">{r.label}</span>
                        <Lock className="h-3.5 w-3.5 text-slate-400" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{r.question}</p>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-600 italic mb-2">
                    <strong className="not-italic font-semibold text-slate-700">Data chain:</strong> {r.dataChain}
                  </div>
                  <div className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] text-amber-800 flex items-center gap-1.5">
                    <Lock className="h-3 w-3 flex-shrink-0" />
                    <span><strong>Collecting data</strong> — requires 90+ days of cross-product history</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ArgusCrossChannelPage;
