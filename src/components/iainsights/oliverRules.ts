// oliverRules — v8.4 OLIVER conditional insight rule libraries.
//
// 8 rule libraries · ~15 conditional rules each · ~120 rules total.
//
// Each library is self-contained for its report. Data context shape
// matches OliverEngineInput from src/oliver/analytics/oliverTrendEngines.

import { type InsightRule, fmt, pct } from "./insightRules";

// ════════════════════════════════════════════════════════════════════
// 1. OPERATIONS HEALTH (15 rules)
// ════════════════════════════════════════════════════════════════════

function statusMap(c: any): Record<string, number> {
  return Object.fromEntries((c.job_status || []).map((r: any) => [r.status, Number(r.n || 0)]));
}

export const OLIVER_OPS_HEALTH_RULES: InsightRule[] = [
  {
    id: "oliver.ops.no_jobs",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0) === 0,
    observation: () => `No jobs recorded this period. Either operations haven't started yet, or job creation isn't flowing into OLIVER. Verify the job creation pipeline + recent job_status_events.`,
    action: () => `Create your first job in OLIVER → Job Board, or wire your existing job-creation source (service request, quote acceptance) to fire oliver.job inserts.`,
  },
  {
    id: "oliver.ops.volume",
    category: "volume",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const total = (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return total > 0;
    },
    observation: (c: any) => {
      const total = (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const days = Number(c.period_days || 30);
      return `${fmt(total)} jobs over ${days} days (${(total / days).toFixed(1)}/day). ${total < 10 ? "Low volume — patterns are directional." : total < 50 ? "Building volume." : "Meaningful operational scale."}`;
    },
  },
  {
    id: "oliver.ops.completion_rate",
    category: "completion",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const s = statusMap(c);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      return total >= 5;
    },
    observation: (c: any) => {
      const s = statusMap(c);
      const completed = (s.completed || 0) + (s.paid || 0) + (s.invoiced || 0);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      const rate = total > 0 ? completed / total : 0;
      if (rate < 0.5) return `${pct(rate)} completion rate — operations are stalling. Most jobs aren't reaching invoiced state. Check for bottlenecks in dispatch → in_progress or in_progress → completed.`;
      if (rate < 0.75) return `${pct(rate)} completion rate. Average; tighter scheduling + clearer completion criteria typically lifts this 10-15 points.`;
      return `${pct(rate)} completion rate — strong operational throughput.`;
    },
  },
  {
    id: "oliver.ops.on_time_rate",
    category: "on-time",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const l = c.job_lifecycle;
      return l && (Number(l.on_time || 0) + Number(l.late || 0)) >= 5;
    },
    observation: (c: any) => {
      const l = c.job_lifecycle;
      const on = Number(l.on_time || 0);
      const late = Number(l.late || 0);
      const rate = (on + late) > 0 ? on / (on + late) : 0;
      if (rate < 0.6) return `${pct(rate)} on-time rate (${on} on-time vs ${late} late). Late jobs damage referrals + repeat-booking rates. Tighten dispatch scheduling + add buffer time for known-variable services.`;
      if (rate < 0.85) return `${pct(rate)} on-time rate. Average for service businesses; small tactical fixes (route optimisation, buffer time, customer-confirmation cadence) typically add 5-10 points.`;
      return `${pct(rate)} on-time rate — excellent. Protect this with consistent dispatch discipline.`;
    },
    action: (c: any) => {
      const l = c.job_lifecycle;
      const on = Number(l?.on_time || 0);
      const late = Number(l?.late || 0);
      if ((on + late) === 0 || on / (on + late) >= 0.85) return "";
      return `Add 15-30 min buffer between scheduled jobs and review your top 5 most-late service types. Often a single service type (e.g. one that frequently runs over) accounts for most lateness.`;
    },
  },
  {
    id: "oliver.ops.avg_completion_time",
    category: "cycle-time",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.job_lifecycle?.avg_completion_hours || 0) > 0,
    observation: (c: any) => {
      const hrs = Number(c.job_lifecycle?.avg_completion_hours || 0);
      return `Average job completion time: ${hrs.toFixed(1)} hours from start to finish. ${hrs < 2 ? "Quick-turnaround service — verify quality isn't sacrificed for speed." : hrs < 8 ? "Single-day service profile." : hrs < 24 ? "Same-day with cleanup or multi-touch." : "Multi-day service profile — ensure customer communication during the gap."}`;
    },
  },
  {
    id: "oliver.ops.in_progress_pile",
    category: "wip",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const s = statusMap(c);
      const wip = (s.in_progress || 0) + (s.dispatched || 0) + (s.assigned || 0);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      return total > 0 && wip / total > 0.4;
    },
    observation: (c: any) => {
      const s = statusMap(c);
      const wip = (s.in_progress || 0) + (s.dispatched || 0) + (s.assigned || 0);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      const ratio = wip / total;
      return `${pct(ratio)} of jobs (${fmt(wip)}) are stuck in WIP states (assigned / dispatched / in-progress). High WIP suggests crew capacity is constrained or completion criteria are unclear — work piles up.`;
    },
  },
  {
    id: "oliver.ops.cancelled_share",
    category: "cancellation",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => {
      const s = statusMap(c);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      return total >= 10 && Number(s.cancelled || 0) / total > 0.1;
    },
    observation: (c: any) => {
      const s = statusMap(c);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      const cancelled = Number(s.cancelled || 0);
      const rate = cancelled / total;
      return `${pct(rate)} of jobs were cancelled (${cancelled} of ${fmt(total)}). High cancellation usually clusters around scheduling delays, price disputes after quote, or wrong-service-area bookings.`;
    },
    action: () => `Tag every cancellation with a reason code. After 10-20 cancellations, the dominant reason becomes addressable — usually a process fix, not a customer-attitude issue.`,
  },
  {
    id: "oliver.ops.dispatched_to_completed",
    category: "throughput",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const s = statusMap(c);
      return Number(s.dispatched || 0) >= 5;
    },
    observation: (c: any) => {
      const s = statusMap(c);
      const dispatched = Number(s.dispatched || 0);
      const completed = (Number(s.completed || 0) + Number(s.paid || 0) + Number(s.invoiced || 0));
      return `${dispatched} jobs dispatched vs ${completed} completed. Dispatched-but-incomplete jobs are your throughput bottleneck — track the dispatch→completion duration to identify which service types stall.`;
    },
  },
  {
    id: "oliver.ops.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const s = statusMap(c);
      const l = c.job_lifecycle || {};
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      const completedRate = total > 0 ? ((s.completed || 0) + (s.paid || 0) + (s.invoiced || 0)) / total : 0;
      const onTimeRate = (Number(l.on_time || 0) + Number(l.late || 0)) > 0 ? Number(l.on_time || 0) / (Number(l.on_time || 0) + Number(l.late || 0)) : 0;
      return total >= 20 && completedRate >= 0.7 && onTimeRate >= 0.85;
    },
    observation: () => `Operations are running well: high completion rate, strong on-time performance. Focus optimisation on cycle-time reduction + service-line mix.`,
  },
  {
    id: "oliver.ops.no_status_events",
    category: "data-gaps",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => !c.job_lifecycle && (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0) > 0,
    observation: () => `Jobs exist but job_status_events aren't flowing — on-time / completion-time observations can't be calculated. Verify status transition events are being recorded in oliver.job_status_events.`,
  },
  {
    id: "oliver.ops.scheduled_share",
    category: "pipeline",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(statusMap(c).scheduled || 0) > 0,
    observation: (c: any) => {
      const s = statusMap(c);
      const scheduled = Number(s.scheduled || 0);
      const total = Object.values(s).reduce((a: number, n) => a + (n as number), 0);
      const share = total > 0 ? Math.round((scheduled / total) * 100) : 0;
      return `${share}% of jobs are scheduled and waiting (${scheduled} jobs). This is your forward-pipeline — watch the ratio of scheduled-to-completed to gauge capacity health.`;
    },
  },
  {
    id: "oliver.ops.review_queue",
    category: "process",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(statusMap(c).review || 0) > 5,
    observation: (c: any) => {
      const s = statusMap(c);
      return `${Number(s.review || 0)} jobs sitting in review status. Review queue should be a same-day step — anything longer indicates a bottleneck on the review side (probably the operator's time).`;
    },
  },
  {
    id: "oliver.ops.revision_loop",
    category: "process",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(statusMap(c).revision || 0) > 3,
    observation: (c: any) => {
      const s = statusMap(c);
      return `${Number(s.revision || 0)} jobs in revision — clients are sending work back. Common causes: scope ambiguity at quote, communication gaps during execution, or expectations mismatch on deliverables.`;
    },
    action: () => `Audit the last 5 revisions for the same root cause. If 3+ share a pattern (e.g. "wrong fixture brand"), update your quote template to capture that detail upfront.`,
  },
  {
    id: "oliver.ops.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0) > 0,
    observation: () => `Pair Operations Health with Crew & Capacity (report 6) to identify whether bottlenecks are throughput-driven (more capacity needed) or process-driven (cycle time too long).`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 2. REVENUE PERFORMANCE (15 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_REVENUE_PERF_RULES: InsightRule[] = [
  {
    id: "oliver.rev.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) === 0,
    observation: () => `No invoiced revenue this period. Either jobs haven't reached invoiced state, or invoice creation isn't flowing into OLIVER. Verify the job-complete → invoice pipeline.`,
    action: () => `Audit the most recent 5 completed jobs. Each should have an associated invoice; if missing, the job-completion → invoice automation isn't firing.`,
  },
  {
    id: "oliver.rev.headline",
    category: "headline",
    kind: "observation",
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.revenue_recent?.revenue || 0) > 0,
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      const days = Number(c.period_days || 30);
      const monthly = (Number(r.revenue || 0) / Math.max(days, 1)) * 30;
      return `$${fmt(Number(r.revenue || 0))} invoiced across ${fmt(Number(r.invoices || 0))} invoices in ${days} days. Annualised run-rate: ~$${fmt(monthly * 12)}.`;
    },
  },
  {
    id: "oliver.rev.collection_rate",
    category: "collection",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) >= 3,
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      const invoices = Number(r.invoices || 0);
      const paid = Number(r.paid || 0);
      const rate = invoices > 0 ? paid / invoices : 0;
      if (rate < 0.6) return `Collection rate is ${pct(rate)} (${paid} of ${invoices} paid). Below 60% indicates either slow customer-payment behaviour, no payment-reminder cadence, or payment friction (no online-pay link).`;
      if (rate < 0.85) return `Collection rate is ${pct(rate)} — average. Adding automated payment reminders at 7/14/30 days past due typically lifts this to 90%+.`;
      return `Collection rate is ${pct(rate)} — strong. Most invoices are getting paid promptly.`;
    },
    action: (c: any) => {
      const r = c.revenue_recent || {};
      const rate = Number(r.invoices || 0) > 0 ? Number(r.paid || 0) / Number(r.invoices || 0) : 0;
      if (rate >= 0.85) return "";
      return `Set up a 3-step automated reminder sequence on overdue invoices: 7 days past due (gentle), 14 days (firm), 30 days (call escalation).`;
    },
  },
  {
    id: "oliver.rev.overdue_share",
    category: "collection",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.revenue_recent?.overdue || 0) > 0,
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      const overdue = Number(r.overdue || 0);
      const invoices = Number(r.invoices || 0);
      const share = invoices > 0 ? overdue / invoices : 0;
      return `${overdue} overdue invoice${overdue === 1 ? "" : "s"} (${pct(share)} of total). Each overdue invoice is working capital tied up + a customer relationship that needs intervention.`;
    },
  },
  {
    id: "oliver.rev.avg_invoice_value",
    category: "ticket",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) >= 3 && Number(c.revenue_recent?.revenue || 0) > 0,
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      const avg = Number(r.invoices || 0) > 0 ? Number(r.revenue || 0) / Number(r.invoices || 0) : 0;
      if (avg < 200) return `Average invoice is $${fmt(avg)} — small-ticket service profile. Volume optimisation matters more than per-ticket expansion at this scale.`;
      if (avg < 1000) return `Average invoice is $${fmt(avg)} — mid-ticket range. Cross-sell + upsell campaigns produce measurable LTV lift at this price point.`;
      return `Average invoice is $${fmt(avg)} — high-ticket service profile. Conversion rates matter more than volume; each lost quote is significant dollars.`;
    },
  },
  {
    id: "oliver.rev.invoice_to_pay_lag",
    category: "cash-flow-link",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.cash_flow?.avg_days_late || 0) > 0,
    observation: (c: any) => {
      const days = Number(c.cash_flow?.avg_days_late || 0);
      if (days < 5) return `Average days from invoice to payment: ${days.toFixed(1)} — fast collections. Healthy cash-flow predictability.`;
      if (days < 20) return `Average days from invoice to payment: ${days.toFixed(1)} — average. Most customers pay within net-30 terms.`;
      return `Average days from invoice to payment: ${days.toFixed(1)} — slow. Cash is consistently tied up in receivables. Faster-pay incentives (1% discount for pay-within-7) often reduce this materially.`;
    },
  },
  {
    id: "oliver.rev.cash_in_no_invoices",
    category: "data-quality",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.cash_flow?.payments_in || 0) > 0 && Number(c.revenue_recent?.invoices || 0) === 0,
    observation: (c: any) => `$${fmt(Number(c.cash_flow?.payments_in || 0))} payments received but no invoices recorded. Either payments are bypassing the invoice flow (cash/check payments not logged), or the invoice → payment link isn't being established.`,
  },
  {
    id: "oliver.rev.invoices_no_cash",
    category: "data-quality",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) > 5 && Number(c.cash_flow?.payments_in || 0) === 0,
    observation: (c: any) => `${Number(c.revenue_recent?.invoices)} invoices issued but no payments received. Either invoices were just sent and payments haven't landed yet, or there's a deeper collection problem.`,
  },
  {
    id: "oliver.rev.recurring_share_unknown",
    category: "recurring",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) > 0,
    observation: () => `Recurring vs one-time revenue split isn't currently surfaced in this report. Recurring revenue (maintenance contracts, subscriptions, retainers) is typically worth 3-5x one-time revenue in LTV terms — tag recurring services explicitly for next iteration.`,
  },
  {
    id: "oliver.rev.payment_count_volume",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.cash_flow?.payment_count || 0) > 0,
    observation: (c: any) => {
      const cnt = Number(c.cash_flow?.payment_count || 0);
      const avg = cnt > 0 ? Number(c.cash_flow?.payments_in || 0) / cnt : 0;
      return `${cnt} payments received this period · average payment $${fmt(avg)}. Payments-per-invoice ratio indicates whether customers are paying in full or in installments.`;
    },
  },
  {
    id: "oliver.rev.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const r = c.revenue_recent || {};
      const invoices = Number(r.invoices || 0);
      const paid = Number(r.paid || 0);
      const overdue = Number(r.overdue || 0);
      return invoices >= 5 && paid / invoices >= 0.85 && overdue / invoices < 0.1;
    },
    observation: () => `Revenue performance is healthy: high collection rate, low overdue share. Focus optimisation on average-ticket expansion or volume growth.`,
  },
  {
    id: "oliver.rev.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) > 0,
    observation: () => `Combine Revenue Performance with Cash Flow (next report) to see whether revenue trajectory is matched by working-capital availability. Strong revenue + weak cash flow = collections process problem.`,
  },
  {
    id: "oliver.rev.thin_volume",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) > 0 && Number(c.revenue_recent?.invoices || 0) < 5,
    observation: (c: any) => `${Number(c.revenue_recent?.invoices)} invoices is small sample — collection rate and average-ticket observations are directional, not statistically reliable.`,
  },
  {
    id: "oliver.rev.high_volume_signal",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) >= 100,
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      return `${fmt(Number(r.invoices))} invoices this period — large operational scale. Per-invoice variations average out; focus on systemic process improvements (templates, automation) rather than per-invoice exceptions.`;
    },
  },
  {
    id: "oliver.rev.invoice_efficiency",
    category: "process",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const r = c.revenue_recent || {};
      return Number(r.invoices || 0) >= 10 && Number(r.revenue || 0) > 0;
    },
    observation: (c: any) => {
      const r = c.revenue_recent || {};
      const days = Number(c.period_days || 30);
      const invoicesPerDay = Number(r.invoices) / days;
      return `${invoicesPerDay.toFixed(1)} invoices per day average. At this cadence, invoice-template automation + auto-send-on-completion is high-ROI; the manual cost of sending each invoice compounds.`;
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// 3. CASH FLOW (14 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_CASH_FLOW_RULES: InsightRule[] = [
  {
    id: "oliver.cash.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.cash_flow?.payment_count || 0) === 0 && Number(c.revenue_recent?.invoices || 0) === 0,
    observation: () => `No cash-flow signals yet. Either no payments or invoices this period, or the Stripe webhook isn't delivering payment events to OLIVER.`,
    action: () => `Verify the Stripe webhook endpoint is receiving events: OLIVER → Settings → Webhooks should show recent payment_intent.succeeded deliveries.`,
  },
  {
    id: "oliver.cash.inflow_volume",
    category: "inflow",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.cash_flow?.payments_in || 0) > 0,
    observation: (c: any) => {
      const flow = c.cash_flow || {};
      const days = Number(c.period_days || 30);
      const monthly = (Number(flow.payments_in || 0) / days) * 30;
      return `$${fmt(Number(flow.payments_in))} received this period (${Number(flow.payment_count || 0)} payments) → monthly run-rate ~$${fmt(monthly)}.`;
    },
  },
  {
    id: "oliver.cash.payment_lag_critical",
    category: "lag",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.cash_flow?.avg_days_late || 0) > 25,
    observation: (c: any) => {
      const days = Number(c.cash_flow?.avg_days_late || 0);
      return `Average days late on payment: ${days.toFixed(1)}. This is well past standard net-30 terms — cash is significantly tied up in receivables. Cash-flow pressure is real, not theoretical.`;
    },
    action: () => `Implement pay-now incentives (1-2% discount for payment within 7 days) and stricter terms enforcement (late fees after 14 days). Combined, these often cut average lag by 30-50%.`,
  },
  {
    id: "oliver.cash.payment_lag_healthy",
    category: "lag",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const d = Number(c.cash_flow?.avg_days_late || 0);
      return d > 0 && d < 10;
    },
    observation: (c: any) => {
      const days = Number(c.cash_flow?.avg_days_late || 0);
      return `Average payment lag: ${days.toFixed(1)} days. Fast collections — your customer base pays promptly. Maintain pay-on-completion or short-net terms.`;
    },
  },
  {
    id: "oliver.cash.overdue_pressure",
    category: "pressure",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.revenue_recent?.overdue || 0) >= 3,
    observation: (c: any) => {
      const overdue = Number(c.revenue_recent?.overdue || 0);
      return `${overdue} overdue invoice${overdue === 1 ? "" : "s"} this period. Each one is working capital tied up; collectively they create cash-flow pressure that compounds if not addressed.`;
    },
    action: () => `Run a payment-reminder campaign on the overdue cohort today. Personalised outreach (not just automated reminder) on overdue invoices recovers 60-80% within 7 days.`,
  },
  {
    id: "oliver.cash.avg_payment_size",
    category: "structure",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.cash_flow?.payment_count || 0) >= 3,
    observation: (c: any) => {
      const flow = c.cash_flow || {};
      const avg = Number(flow.payment_count || 0) > 0 ? Number(flow.payments_in || 0) / Number(flow.payment_count || 0) : 0;
      const invoiceAvg = Number(c.revenue_recent?.invoices || 0) > 0 ? Number(c.revenue_recent?.revenue || 0) / Number(c.revenue_recent?.invoices || 0) : 0;
      if (invoiceAvg > 0 && avg / invoiceAvg < 0.7) {
        return `Average payment ($${fmt(avg)}) is significantly below average invoice ($${fmt(invoiceAvg)}). Customers are paying in installments — accelerate by offering single-payment discounts or stricter installment terms.`;
      }
      return `Average payment is $${fmt(avg)}. Healthy single-payment-per-invoice pattern.`;
    },
  },
  {
    id: "oliver.cash.pipeline_value",
    category: "pipeline",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.quote_funnel?.pipeline_value || 0) > 0,
    observation: (c: any) => {
      const pv = Number(c.quote_funnel?.pipeline_value || 0);
      const acceptedRate = Number(c.quote_funnel?.total || 0) > 0 ? Number(c.quote_funnel?.accepted || 0) / Number(c.quote_funnel?.total || 0) : 0;
      const projected = pv * acceptedRate;
      return `$${fmt(pv)} in open quote pipeline. At your current ${pct(acceptedRate)} acceptance rate, projected future revenue from this pipeline: ~$${fmt(projected)}. This is forward cash visibility.`;
    },
  },
  {
    id: "oliver.cash.runway_thin",
    category: "runway",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const inflow = Number(c.cash_flow?.payments_in || 0);
      const overdue = Number(c.revenue_recent?.overdue || 0);
      const invoices = Number(c.revenue_recent?.invoices || 0);
      // Pressure signal: high overdue share AND low cash inflow
      return invoices > 0 && overdue / invoices > 0.3 && inflow > 0 && Number(c.cash_flow?.avg_days_late || 0) > 14;
    },
    observation: (c: any) => {
      const overdue = Number(c.revenue_recent?.overdue || 0);
      const invoices = Number(c.revenue_recent?.invoices || 0);
      const days = Number(c.cash_flow?.avg_days_late || 0);
      return `Cash-flow pressure: ${pct(overdue / Math.max(invoices, 1))} overdue share + ${days.toFixed(0)}-day average lag. Future receipts will compound with new invoicing — but operationally you're working with delayed cash. Tighten collections now.`;
    },
  },
  {
    id: "oliver.cash.predictable_inflow",
    category: "predictability",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.cash_flow?.payment_count || 0) >= 10,
    observation: (c: any) => {
      const cnt = Number(c.cash_flow?.payment_count || 0);
      const days = Number(c.period_days || 30);
      const perDay = cnt / Math.max(days, 1);
      return `${perDay.toFixed(1)} payments per day average. ${cnt >= 30 ? "Reliable cash-flow predictability — easier to budget against." : "Building toward predictable cash-flow rhythm."}`;
    },
  },
  {
    id: "oliver.cash.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.cash_flow?.payments_in || 0) > 0 || Number(c.revenue_recent?.revenue || 0) > 0,
    observation: () => `Cash flow becomes meaningful at the rolling 90-day view. This report's single-period snapshot is one data point; trend visibility appears in the Health page bar charts.`,
  },
  {
    id: "oliver.cash.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const flow = c.cash_flow || {};
      const days = Number(flow.avg_days_late || 0);
      const overdue = Number(c.revenue_recent?.overdue || 0);
      const invoices = Number(c.revenue_recent?.invoices || 0);
      return Number(flow.payment_count || 0) >= 5 && days > 0 && days < 14 && overdue / Math.max(invoices, 1) < 0.1;
    },
    observation: () => `Cash flow is healthy: short payment lag, low overdue share. Cash predictability is intact.`,
  },
  {
    id: "oliver.cash.payment_terms_review",
    category: "process",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.cash_flow?.avg_days_late || 0) > 14 && Number(c.cash_flow?.avg_days_late || 0) <= 25,
    observation: () => `Payment lag in the 14-25 day range. Customer base treats your terms as flexible. This is the easiest range to compress because the behaviour isn't entrenched — clear payment terms + automated reminders catch most slip.`,
    action: () => `Add payment terms language to every invoice ("Payment due within 7 days of invoice date"). Adding a clear due date + automated reminder at day 5 typically pulls average lag inside 10 days.`,
  },
  {
    id: "oliver.cash.no_overdue_signal",
    category: "collection",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.revenue_recent?.invoices || 0) >= 5 && Number(c.revenue_recent?.overdue || 0) === 0,
    observation: () => `Zero overdue invoices on a 5+ invoice base. Either you're invoicing tightly with quick pay terms, or overdue tracking isn't configured. If the latter, OLIVER needs net-terms thresholds set per customer.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 4. QUOTE & WIN RATE (14 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_QUOTE_WIN_RULES: InsightRule[] = [
  {
    id: "oliver.quote.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.quote_funnel?.total || 0) === 0,
    observation: () => `No quotes recorded this period. Either you're not using formal quotes (going straight to job creation), or quote events aren't being tracked. If you do verbal estimates, transitioning to recorded quotes unlocks every observation in this report.`,
    action: () => `Use OLIVER → Quotes for every new opportunity. Even a 5-minute quote draft creates a tracking record that enables win-rate analysis later.`,
  },
  {
    id: "oliver.quote.win_rate",
    category: "win-rate",
    kind: "observation",
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const q = c.quote_funnel || {};
      return (Number(q.accepted || 0) + Number(q.rejected || 0)) >= 5;
    },
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      const rate = decided > 0 ? Number(q.accepted || 0) / decided : 0;
      if (rate < 0.3) return `Win rate is ${pct(rate)} (${q.accepted} won of ${decided} decided). Below 30% suggests either price mismatch, scope mismatch, or response-time lag. Win-loss reviews on recent decisions usually surface the pattern.`;
      if (rate < 0.5) return `Win rate is ${pct(rate)}. Industry-average range; tactical lifts (faster response, structured discovery, better proposal templates) typically add 5-10 points.`;
      return `Win rate is ${pct(rate)} — strong. Codify the qualifying questions + proposal structure that's working.`;
    },
  },
  {
    id: "oliver.quote.draft_backlog",
    category: "process",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.quote_funnel?.draft || 0) >= 5,
    observation: (c: any) => `${Number(c.quote_funnel?.draft || 0)} quotes in draft status — drafts that don't get sent are revenue opportunities sitting on a desk.`,
    action: () => `Set a same-day SLA for quote send-out. If a quote is started and not sent within 24 hours, fire a workflow trigger reminding the operator.`,
  },
  {
    id: "oliver.quote.pipeline_value",
    category: "pipeline",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.quote_funnel?.pipeline_value || 0) > 0,
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      return `$${fmt(Number(q.pipeline_value))} in open quote pipeline. At ${pct(Number(q.total || 0) > 0 ? Number(q.accepted || 0) / Number(q.total || 0) : 0)} historical win rate, expected future revenue: ~$${fmt(Number(q.pipeline_value) * (Number(q.total || 0) > 0 ? Number(q.accepted || 0) / Number(q.total || 0) : 0.3))}.`;
    },
  },
  {
    id: "oliver.quote.avg_quote_size",
    category: "ticket",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.quote_funnel?.accepted || 0) > 0,
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const avgWon = Number(q.accepted || 0) > 0 ? Number(q.accepted_value || 0) / Number(q.accepted || 0) : 0;
      return `Average accepted quote value: $${fmt(avgWon)} (${Number(q.accepted)} accepted quotes totalling $${fmt(Number(q.accepted_value))}). Lifting average quote value 10% typically lifts revenue ~10% with no extra operational load.`;
    },
  },
  {
    id: "oliver.quote.high_rejection",
    category: "rejection",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      return decided >= 10 && Number(q.rejected || 0) / decided > 0.5;
    },
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      const rate = Number(q.rejected || 0) / decided;
      return `${pct(rate)} of quotes are rejected (${q.rejected} of ${decided}). High rejection clusters around: price (most common), timing, or scope-misfit.`;
    },
    action: () => `Tag every rejected quote with a reason code. After 10 rejections, the dominant reason is addressable — usually a quote-template issue (presenting price too prominently, scope too narrow, no good/better/best options).`,
  },
  {
    id: "oliver.quote.quote_to_job_loop",
    category: "throughput",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const q = c.quote_funnel || {};
      const jobs = (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return Number(q.accepted || 0) > 0 && jobs > 0;
    },
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const accepted = Number(q.accepted || 0);
      const jobs = (c.job_status || []).reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const ratio = jobs > 0 ? accepted / jobs : 0;
      return `${accepted} accepted quotes vs ${jobs} jobs created. ${ratio < 0.5 ? "Most jobs aren't preceded by recorded quotes — quote-tracking discipline is the gap." : ratio > 1.5 ? "More accepted quotes than jobs — some accepted quotes haven't moved to job creation yet." : "Quote-to-job ratio is balanced."}`;
    },
  },
  {
    id: "oliver.quote.win_rate_benchmark",
    category: "benchmarks",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      return decided >= 10 && c.benchmarks?.oliver_quote_win_rate_pct != null;
    },
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      const rate = (Number(q.accepted || 0) / decided) * 100;
      const bench = Number(c.benchmarks?.oliver_quote_win_rate_pct || 40);
      const gap = rate - bench;
      if (gap > 5) return `Win rate (${rate.toFixed(0)}%) is ${gap.toFixed(0)} points above your industry benchmark (${bench}%) — sustained outperformance is a defensible competitive advantage.`;
      if (gap < -5) return `Win rate (${rate.toFixed(0)}%) is ${Math.abs(gap).toFixed(0)} points below your industry benchmark (${bench}%). Closing the gap should be the highest-priority sales-process investment.`;
      return `Win rate is in line with your industry benchmark (${bench}%). Moving above requires deliberate process work: faster response, tighter discovery, better proposals.`;
    },
  },
  {
    id: "oliver.quote.no_pricing_options",
    category: "structure",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.quote_funnel?.total || 0) >= 5,
    observation: () => `Service businesses with good/better/best quote options typically win 15-25% more often than single-option quotes. Customers anchor against the middle option and frequently choose up.`,
    action: () => `Test good/better/best quote templates on your next 10 quotes. Even crude 3-tier options usually lift acceptance.`,
  },
  {
    id: "oliver.quote.value_concentration",
    category: "ticket",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.quote_funnel?.accepted_value || 0) > 5000 && Number(c.quote_funnel?.accepted || 0) >= 3,
    observation: (c: any) => {
      const q = c.quote_funnel || {};
      const avg = Number(q.accepted || 0) > 0 ? Number(q.accepted_value || 0) / Number(q.accepted || 0) : 0;
      if (avg > 5000) return `High-ticket service profile ($${fmt(avg)} avg). Each lost quote is significant dollars — response time + proposal quality matter more than volume at this price point.`;
      return "";
    },
  },
  {
    id: "oliver.quote.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const q = c.quote_funnel || {};
      const decided = Number(q.accepted || 0) + Number(q.rejected || 0);
      const rate = decided > 0 ? Number(q.accepted || 0) / decided : 0;
      return decided >= 20 && rate >= 0.5;
    },
    observation: () => `Quote process is performing well: meaningful sample, healthy win rate. Focus optimisation on average-ticket lift rather than win-rate squeeze.`,
  },
  {
    id: "oliver.quote.thin_sample",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.quote_funnel?.total || 0) > 0 && Number(c.quote_funnel?.total || 0) < 10,
    observation: (c: any) => `${Number(c.quote_funnel?.total)} quotes — thin sample. Win-rate observations are directional; statistically reliable benchmarking needs 30+ decided quotes.`,
  },
  {
    id: "oliver.quote.response_time_critical",
    category: "speed",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.quote_funnel?.total || 0) >= 5,
    observation: () => `Research consistently shows quotes responded to within 2 hours close at 50-60% higher rates than next-day responses. Same-day quote send-out is the highest-leverage win-rate lever available.`,
  },
  {
    id: "oliver.quote.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.quote_funnel?.total || 0) > 0,
    observation: () => `Pair Quote & Win Rate with Revenue Performance to understand whether wins are translating to actual revenue at expected pace.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 5. CUSTOMER RETENTION (14 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_RETENTION_RULES: InsightRule[] = [
  {
    id: "oliver.ret.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) === 0,
    observation: () => `No customer-retention data yet. Either no jobs have been completed for repeat-customer tracking, or customer-id linkage on jobs isn't established.`,
    action: () => `Verify oliver.job has contact_id populated on every completed job. Without that linkage, repeat-booking detection can't function.`,
  },
  {
    id: "oliver.ret.active_volume",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 0,
    observation: (c: any) => {
      const active = Number(c.retention?.active_customers || 0);
      return `${fmt(active)} active customer${active === 1 ? "" : "s"} (had at least one job recently). ${active < 50 ? "Small customer base — retention math is volatile." : active < 500 ? "Growing customer base." : "Substantial customer book."}`;
    },
  },
  {
    id: "oliver.ret.at_risk_share",
    category: "risk",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 0 && Number(c.retention?.at_risk || 0) > 0,
    observation: (c: any) => {
      const r = c.retention || {};
      const total = Number(r.active_customers || 0);
      const atRisk = Number(r.at_risk || 0);
      const rate = total > 0 ? atRisk / total : 0;
      if (rate > 0.3) return `${pct(rate)} of active customers are at-risk (${atRisk} of ${fmt(total)}) — overdue for next booking based on historical frequency. This is your reactivation opportunity pool.`;
      if (rate > 0.1) return `${pct(rate)} at-risk share (${atRisk} customers). Manageable; a targeted check-in campaign typically recovers 20-30%.`;
      return `${pct(rate)} at-risk share — strong retention. Active customers are booking on cadence.`;
    },
    action: (c: any) => {
      const rate = Number(c.retention?.active_customers || 0) > 0 ? Number(c.retention?.at_risk || 0) / Number(c.retention?.active_customers || 0) : 0;
      if (rate < 0.1) return "";
      return `Build a "we haven't seen you in [N] days" reactivation automation tied to historical booking cadence. Even a simple check-in SMS recovers 20-30% of at-risk customers.`;
    },
  },
  {
    id: "oliver.ret.jobs_per_customer",
    category: "frequency",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.retention?.avg_jobs_per_customer || 0) > 0,
    observation: (c: any) => {
      const avg = Number(c.retention?.avg_jobs_per_customer || 0);
      if (avg < 1.3) return `Average ${avg.toFixed(2)} jobs per customer — mostly one-time customers. Repeat-business is the highest-leverage LTV lever for service businesses; targeted post-service follow-up sequences typically lift this 20-40%.`;
      if (avg < 2.5) return `Average ${avg.toFixed(2)} jobs per customer — moderate repeat business. Healthy if your service category is one-and-done by nature (e.g. major install), worth growing if recurring service is possible.`;
      return `Average ${avg.toFixed(2)} jobs per customer — strong repeat-business pattern. Your customer base is generating compounding LTV; protect this with consistent quality + structured retention.`;
    },
  },
  {
    id: "oliver.ret.one_time_pattern",
    category: "frequency",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Number(c.retention?.avg_jobs_per_customer || 0) > 0 && Number(c.retention?.avg_jobs_per_customer || 0) < 1.2,
    observation: () => `Customer base shows strong one-time pattern. Most service businesses can move repeat rate above 1.5 with: structured post-service follow-up, recurring-service packages (annual maintenance), and review-driven reactivation.`,
    action: () => `Launch one repeat-driving initiative this quarter: (a) annual reminder for recurring services, (b) cross-sell automation post-job, or (c) bundled service packages. Single initiative typically lifts repeat rate 0.2-0.4.`,
  },
  {
    id: "oliver.ret.cross_sell_opportunity",
    category: "cross-sell",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.retention?.avg_jobs_per_customer || 0) >= 1.5,
    observation: () => `Healthy repeat rate — customers are coming back. Each return visit is an opportunity to introduce adjacent services (cross-sell) or higher-tier offerings (upsell). Track the dominant cross-sell paths and codify them in your customer-success workflow.`,
  },
  {
    id: "oliver.ret.contact_base_link",
    category: "linkage",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 0 && Number(c.contact_totals?.active || 0) > 0,
    observation: (c: any) => {
      const active = Number(c.retention?.active_customers || 0);
      const totalContacts = Number(c.contact_totals?.active || 0);
      const ratio = totalContacts > 0 ? active / totalContacts : 0;
      if (ratio < 0.1) return `Only ${pct(ratio)} of SPARK contacts are active OLIVER customers (${fmt(active)} of ${fmt(totalContacts)}). Most of your contact base hasn't converted to repeat customers — this is the largest LTV unlock available.`;
      if (ratio > 0.5) return `${pct(ratio)} of SPARK contacts have become active OLIVER customers — strong conversion. Continue current acquisition + activation patterns.`;
      return "";
    },
  },
  {
    id: "oliver.ret.win_back_revenue",
    category: "revenue",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.retention?.at_risk || 0) >= 5 && Number(c.revenue_recent?.revenue || 0) > 0,
    observation: (c: any) => {
      const r = c.retention || {};
      const atRisk = Number(r.at_risk || 0);
      const totalRev = Number(c.revenue_recent?.revenue || 0);
      const totalActive = Number(r.active_customers || 1);
      const avgRev = totalRev / totalActive;
      const recoverable = Math.round(atRisk * avgRev * 0.2);
      return `${atRisk} at-risk customers × $${fmt(avgRev)} avg revenue per active × 20% historical reactivation rate ≈ $${fmt(recoverable)} recoverable. A targeted reactivation campaign is one of the highest-ROI moves available.`;
    },
  },
  {
    id: "oliver.ret.no_at_risk_signal",
    category: "data-gaps",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 20 && Number(c.retention?.at_risk || 0) === 0,
    observation: () => `Zero at-risk customers on a 20+ customer base. Either retention is exceptionally strong, or the at-risk threshold isn't configured (no historical-frequency baseline to compare against).`,
  },
  {
    id: "oliver.ret.repeat_velocity",
    category: "frequency",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) >= 10 && Number(c.retention?.avg_jobs_per_customer || 0) >= 2,
    observation: (c: any) => {
      const total = Number(c.retention?.active_customers || 0);
      const avg = Number(c.retention?.avg_jobs_per_customer || 0);
      return `${fmt(total)} active customers averaging ${avg.toFixed(1)} jobs each — strong customer-economics foundation. Multi-job customers typically have 3-5x LTV and refer 2-3x more often.`;
    },
  },
  {
    id: "oliver.ret.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const r = c.retention || {};
      const active = Number(r.active_customers || 0);
      const atRiskRatio = active > 0 ? Number(r.at_risk || 0) / active : 0;
      return active >= 30 && atRiskRatio < 0.15 && Number(r.avg_jobs_per_customer || 0) >= 1.5;
    },
    observation: () => `Customer retention is healthy: large active base, low at-risk share, healthy repeat-job pattern. Focus on customer LTV expansion (upsell, cross-sell) rather than reactivation.`,
  },
  {
    id: "oliver.ret.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 0,
    observation: () => `Pair Customer Retention with the OLIVER → SPARK lifetime_value sync to surface revenue-at-risk numbers. Without the LTV link, retention is visible but unquantifiable in revenue terms.`,
  },
  {
    id: "oliver.ret.thin_base_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) > 0 && Number(c.retention?.active_customers || 0) < 20,
    observation: (c: any) => `${Number(c.retention?.active_customers)} active customers — small base. Retention metrics are directional; statistically reliable observations need 50+ customers with historical frequency data.`,
  },
  {
    id: "oliver.ret.churn_economics",
    category: "economics",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.retention?.active_customers || 0) >= 20,
    observation: () => `Customer-acquisition cost for service businesses typically runs $50-500 depending on channel. If your at-risk pool has ANY recoverable LTV at all, reactivation almost always beats new acquisition on per-dollar return.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 6. CREW & CAPACITY (14 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_CREW_RULES: InsightRule[] = [
  {
    id: "oliver.crew.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) === 0,
    observation: () => `No workers with assignments this period. Either no jobs have been assigned to crew, or worker-assignment linkage isn't being recorded.`,
    action: () => `When dispatching jobs in OLIVER → Dispatch, ensure worker assignment is captured. The oliver.job_assignment table is the source for all crew analysis.`,
  },
  {
    id: "oliver.crew.utilisation",
    category: "utilisation",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Number(c.crew?.avg_jobs_per_worker || 0) > 0,
    observation: (c: any) => {
      const avg = Number(c.crew?.avg_jobs_per_worker || 0);
      const workers = Number(c.crew?.workers_with_assignments || 0);
      const days = Number(c.period_days || 30);
      const perDay = avg / days;
      if (perDay < 0.5) return `${workers} workers averaging ${avg.toFixed(1)} jobs each over ${days} days (${perDay.toFixed(2)}/day per worker). Under-utilised — capacity exists for ${Math.round((1 - perDay) * 2)}x more work.`;
      if (perDay < 1.5) return `${workers} workers averaging ${avg.toFixed(1)} jobs each over ${days} days. Healthy utilisation pattern.`;
      return `${workers} workers averaging ${avg.toFixed(1)} jobs each over ${days} days (${perDay.toFixed(2)}/day per worker). High utilisation — crew is near capacity. Plan ahead for hiring or contract help.`;
    },
  },
  {
    id: "oliver.crew.capacity_constrained",
    category: "capacity",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const avg = Number(c.crew?.avg_jobs_per_worker || 0);
      const days = Number(c.period_days || 30);
      return days > 0 && avg / days > 1.5;
    },
    observation: () => `Crew is operating near or above sustainable capacity. Risk indicators: rising late-completion rate, increasing job cycle time, growing scheduled-but-not-dispatched backlog.`,
    action: () => `Plan capacity addition in the next 60 days. Options ranked by speed: (1) part-time contract crew, (2) full-time hire, (3) outsource overflow to a partner. Each takes 30-90 days to be productive.`,
  },
  {
    id: "oliver.crew.under_utilised",
    category: "capacity",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => {
      const avg = Number(c.crew?.avg_jobs_per_worker || 0);
      const days = Number(c.period_days || 30);
      const workers = Number(c.crew?.workers_with_assignments || 0);
      return workers >= 2 && days > 0 && avg / days < 0.5;
    },
    observation: () => `Crew is significantly under-utilised. Either work volume is below capacity (acquisition problem) or crew scheduling isn't packing jobs efficiently (process problem).`,
    action: () => `If volume is the issue, focus on Quote & Win Rate + Lead Pipeline (acquisition) reports. If scheduling is the issue, audit dispatch routing — drive time between jobs often dominates daily capacity.`,
  },
  {
    id: "oliver.crew.worker_count",
    category: "structure",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) > 0,
    observation: (c: any) => {
      const w = Number(c.crew?.workers_with_assignments || 0);
      if (w === 1) return `Single-worker operation. Capacity is hard-capped at one person's throughput; growth requires hiring before revenue scales.`;
      if (w < 5) return `${w}-person crew. Small-team operation; capacity is tied to scheduling efficiency more than raw worker count.`;
      if (w < 15) return `${w}-person crew. Mid-size operation; dispatch + scheduling automation start producing real ROI at this scale.`;
      return `${w}-person crew. Large operation; dispatch, scheduling, time-tracking, and routing automation are essential — every minute saved per job × ${w} workers compounds.`;
    },
  },
  {
    id: "oliver.crew.completion_signal",
    category: "performance",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.job_lifecycle?.avg_completion_hours || 0) > 0 && Number(c.crew?.avg_jobs_per_worker || 0) > 0,
    observation: (c: any) => {
      const hrs = Number(c.job_lifecycle?.avg_completion_hours || 0);
      const avgJobs = Number(c.crew?.avg_jobs_per_worker || 0);
      const days = Number(c.period_days || 30);
      const totalCrewHrs = hrs * avgJobs * Number(c.crew?.workers_with_assignments || 0);
      const availableHrs = days * 8 * Number(c.crew?.workers_with_assignments || 0);
      const utilPct = availableHrs > 0 ? (totalCrewHrs / availableHrs) * 100 : 0;
      return `Estimated crew utilisation: ${Math.round(utilPct)}% of available hours filled with job time (excludes travel + admin). Realistic ceiling is 60-70% for service businesses; above that and burnout risk rises.`;
    },
  },
  {
    id: "oliver.crew.travel_time_warning",
    category: "process",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) >= 2 && Number(c.job_lifecycle?.avg_completion_hours || 0) > 0,
    observation: () => `For multi-worker, multi-job-per-day operations, drive time between jobs commonly consumes 25-40% of crew capacity. Route-optimisation tools (or simple geographic batching) typically recover 1-2 jobs/day per crew.`,
  },
  {
    id: "oliver.crew.crew_efficiency_link",
    category: "performance",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) >= 2,
    observation: () => `Track per-worker dispatch-to-on-site time, average on-site duration by service type, and callback rate. The top quartile of crew members typically completes 30-50% more jobs/day than the median.`,
  },
  {
    id: "oliver.crew.peak_capacity_planning",
    category: "planning",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 3 && Number(c.crew?.workers_with_assignments || 0) > 0,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const max = seasonal.reduce((m: number, r: any) => Math.max(m, Number(r.n || 0)), 0);
      const avg = seasonal.reduce((s: number, r: any) => s + Number(r.n || 0), 0) / seasonal.length;
      const peakRatio = avg > 0 ? max / avg : 0;
      if (peakRatio > 2) return `Peak season is ~${peakRatio.toFixed(1)}x average — significant seasonal load. Plan capacity by your peak, not your average; rolling contract help during peak months is cheaper than full-time underutilised hire.`;
      return `Seasonal load is relatively balanced (peak ${peakRatio.toFixed(1)}x average). Year-round full-time capacity planning is appropriate.`;
    },
  },
  {
    id: "oliver.crew.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const avg = Number(c.crew?.avg_jobs_per_worker || 0);
      const days = Number(c.period_days || 30);
      return Number(c.crew?.workers_with_assignments || 0) >= 2 && days > 0 && avg / days >= 0.5 && avg / days <= 1.5;
    },
    observation: () => `Crew utilisation is in the healthy 0.5-1.5 jobs/day range per worker. Continue current dispatch discipline; review monthly for drift.`,
  },
  {
    id: "oliver.crew.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) > 0,
    observation: () => `Pair Crew & Capacity with Operations Health (report 1) to distinguish process bottlenecks from capacity bottlenecks. High WIP + healthy crew utilisation = process issue. Healthy WIP + saturated crew = capacity issue.`,
  },
  {
    id: "oliver.crew.thin_data",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) > 0 && Number(c.crew?.avg_jobs_per_worker || 0) < 3,
    observation: () => `Few jobs per worker this period — utilisation observations are directional. Statistically meaningful per-worker performance comparison needs 20+ completed jobs per worker.`,
  },
  {
    id: "oliver.crew.solo_operator",
    category: "structure",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) === 1,
    observation: () => `Solo-operator profile. Growth ceiling is your personal daily capacity. Two paths: (a) hire and accept lower hourly margin to scale revenue, (b) raise prices and focus on higher-ticket fewer-job model.`,
    action: () => `Decide which path before you're forced to. Hiring takes 60-90 days to recover the investment; raising prices is immediate but caps total revenue at a different ceiling. Pick deliberately.`,
  },
  {
    id: "oliver.crew.dispatch_concentration",
    category: "process",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Number(c.crew?.workers_with_assignments || 0) >= 3,
    observation: () => `On multi-worker crews, top performer typically dispatches 40-60% faster than median. Codifying the top performer's pre-job preparation, routing decisions, and on-site flow into a checklist often lifts median performance 15-25%.`,
  },
];

// ════════════════════════════════════════════════════════════════════
// 7. SERVICE LINE PERFORMANCE (15 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_SERVICE_LINE_RULES: InsightRule[] = [
  {
    id: "oliver.svc.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !Array.isArray(c.service_line) || c.service_line.length === 0,
    observation: () => `No service-line breakdown yet. Either jobs aren't being categorised by service type, or service_type isn't being captured at quote/job creation.`,
    action: () => `Configure your service catalog (OLIVER → Service Catalog) and ensure every quote + job selects a service. Without service categorisation, line-level analysis is impossible.`,
  },
  {
    id: "oliver.svc.line_count",
    category: "diversity",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length > 0,
    observation: (c: any) => {
      const n = c.service_line.length;
      if (n === 1) return `Single service line. Specialisation has advantages (deep expertise, easier marketing) but creates single-product risk — a demand shift in that service category has full revenue impact.`;
      if (n < 5) return `${n} service lines — focused service mix. Easier to maintain quality + pricing discipline at this concentration.`;
      if (n < 15) return `${n} service lines — broad mix. Discipline matters: most multi-service operations have 2-3 lines producing 80% of revenue with the rest as noise.`;
      return `${n} service lines — very broad. Likely opportunity to consolidate; long-tail services dilute pricing power + operational consistency.`;
    },
  },
  {
    id: "oliver.svc.top_line",
    category: "leadership",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length > 0,
    observation: (c: any) => {
      const lines = c.service_line || [];
      const top = lines[0];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const share = totalRev > 0 ? Number(top.total_value || 0) / totalRev : 0;
      return `Top service line: "${top.service_type}" — ${fmt(Number(top.n))} jobs at $${fmt(Number(top.avg_value || 0))} avg = $${fmt(Number(top.total_value || 0))} total (${pct(share)} of service revenue).`;
    },
  },
  {
    id: "oliver.svc.revenue_concentration",
    category: "risk",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 9,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      return totalRev > 0 && Number(lines[0]?.total_value || 0) / totalRev > 0.65;
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const top = lines[0];
      const share = totalRev > 0 ? Number(top.total_value || 0) / totalRev : 0;
      return `${pct(share)} of service revenue from a single line (${top.service_type}). Demand shift in that category would halve your revenue — concentration is the largest service-line risk.`;
    },
    action: () => `Identify your highest-LTV cross-sell from the top line into an adjacent service. Even modest diversification (a second line at 15-20% share) materially reduces single-line risk.`,
  },
  {
    id: "oliver.svc.long_tail_revenue",
    category: "tail",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length >= 5,
    observation: (c: any) => {
      const lines = c.service_line || [];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const top3Rev = lines.slice(0, 3).reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const top3Share = totalRev > 0 ? (top3Rev / totalRev) * 100 : 0;
      return `Top 3 service lines = ${top3Share.toFixed(0)}% of revenue. ${top3Share > 85 ? "Classic 80/20 — long tail produces 15% of revenue but consumes proportional operational overhead. Audit for services to retire or bundle." : "Reasonably distributed across lines."}`;
    },
  },
  {
    id: "oliver.svc.avg_value_high",
    category: "ticket",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      if (!lines.length) return false;
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return totalN > 0 && totalRev / totalN > 2000;
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const avg = totalN > 0 ? totalRev / totalN : 0;
      return `Overall average job value: $${fmt(avg)} — high-ticket service mix. Each lost quote is significant dollars; conversion-rate optimisation has higher ROI than volume optimisation at this price point.`;
    },
  },
  {
    id: "oliver.svc.avg_value_low",
    category: "ticket",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      if (!lines.length) return false;
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return totalN > 0 && totalRev / totalN < 200;
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      const avg = totalN > 0 ? totalRev / totalN : 0;
      return `Overall average job value: $${fmt(avg)} — small-ticket service mix. Volume + operational efficiency drive economics; each marginal job needs to be near-zero acquisition cost to be worthwhile.`;
    },
  },
  {
    id: "oliver.svc.high_volume_low_value",
    category: "mix",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      return lines.length >= 2 && lines.some((l: any) =>
        Number(l.n) >= 5 && Number(l.avg_value || 0) < 200
      );
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const lowValue = lines.find((l: any) => Number(l.n) >= 5 && Number(l.avg_value || 0) < 200);
      return `"${lowValue.service_type}" runs at $${fmt(Number(lowValue.avg_value || 0))} per job — high-volume, low-margin profile. Verify this service is profitable after dispatch + travel costs. Bundle with higher-value services or raise prices.`;
    },
    action: () => `Run a profitability audit on the high-volume low-ticket line. If it's loss-leading without driving adjacent revenue, either restructure pricing or sunset.`,
  },
  {
    id: "oliver.svc.high_value_low_volume",
    category: "mix",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      return lines.length >= 2 && lines.some((l: any) =>
        Number(l.n) <= 3 && Number(l.avg_value || 0) > 2000
      );
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const highValue = lines.find((l: any) => Number(l.n) <= 3 && Number(l.avg_value || 0) > 2000);
      return `"${highValue.service_type}" is high-value ($${fmt(Number(highValue.avg_value || 0))}) but low-volume (${highValue.n} jobs). Each win is significant — focused marketing on this line typically produces outsized ROI per dollar spent.`;
    },
  },
  {
    id: "oliver.svc.no_revenue_data",
    category: "data-gaps",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      return lines.length > 0 && lines.every((l: any) => Number(l.total_value || 0) === 0);
    },
    observation: () => `Service lines have job counts but no revenue values populated. Revenue allocation per service requires invoice_line_item entries to be linked to the job — verify your invoicing flow captures service_type per line.`,
  },
  {
    id: "oliver.svc.bottom_line",
    category: "tail",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length >= 3,
    observation: (c: any) => {
      const lines = c.service_line || [];
      const worst = lines[lines.length - 1];
      return `Smallest service line: "${worst.service_type}" — ${fmt(Number(worst.n))} job${Number(worst.n) === 1 ? "" : "s"} at $${fmt(Number(worst.avg_value || 0))} avg = $${fmt(Number(worst.total_value || 0))} total. If this service consumes proportional setup or marketing overhead, consider sunset or bundling into a larger line.`;
    },
  },
  {
    id: "oliver.svc.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      if (lines.length < 3) return false;
      const totalRev = lines.reduce((s: number, r: any) => s + Number(r.total_value || 0), 0);
      return Number(lines[0]?.total_value || 0) / Math.max(totalRev, 1) < 0.5;
    },
    observation: () => `Service mix is diversified with no single line dominating revenue. Healthy structure for resilience; continue to monitor for concentration drift over quarters.`,
  },
  {
    id: "oliver.svc.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length > 0,
    observation: () => `Service Line Performance is revenue-only at launch. True margin analysis (cost per service, gross margin) arrives with STELLA integration — narrative will automatically upgrade once cost data is connected.`,
  },
  {
    id: "oliver.svc.cross_sell_opportunity",
    category: "opportunity",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.service_line) && c.service_line.length >= 3,
    observation: (c: any) => {
      const lines = c.service_line || [];
      const top = lines[0];
      const second = lines[1];
      return `Customers who buy "${top.service_type}" are your largest cohort. Top cross-sell opportunity: introduce "${second.service_type}" via post-job email to ${top.service_type} customers. Adjacent-service cross-sell typically achieves 10-20% adoption with minimal acquisition cost.`;
    },
  },
  {
    id: "oliver.svc.scale_warning",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const lines = c.service_line || [];
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return totalN > 0 && totalN < 10;
    },
    observation: (c: any) => {
      const lines = c.service_line || [];
      const totalN = lines.reduce((s: number, r: any) => s + Number(r.n || 0), 0);
      return `${totalN} total jobs across all service lines — thin sample. Per-line economics are directional; statistically reliable line-by-line comparisons need 20+ jobs per line.`;
    },
  },
];

// ════════════════════════════════════════════════════════════════════
// 8. SEASONAL PLANNING (14 rules)
// ════════════════════════════════════════════════════════════════════

export const OLIVER_SEASONAL_RULES: InsightRule[] = [
  {
    id: "oliver.season.no_data",
    category: "data-gaps",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 10,
    appliesWhen: (c: any) => !Array.isArray(c.seasonal) || c.seasonal.length === 0,
    observation: () => `No seasonal data yet. Seasonal patterns require at least 3-4 months of job history to surface. Reports become statistically meaningful at 12 months of data.`,
    action: () => `Continue normal operations — seasonality observations populate automatically as months accumulate.`,
  },
  {
    id: "oliver.season.month_count",
    category: "scale",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length > 0,
    observation: (c: any) => {
      const n = c.seasonal.length;
      if (n < 4) return `Only ${n} month${n === 1 ? "" : "s"} of historical data. Seasonal patterns aren't visible yet — at least 12 months are needed for reliable year-over-year comparison.`;
      if (n < 12) return `${n} months of historical data. Patterns are emerging but year-over-year comparison isn't possible yet. Continue collecting; full seasonal model available at 12+ months.`;
      return `${n} months of historical data. Sufficient for year-over-year comparison + seasonal-pattern detection.`;
    },
  },
  {
    id: "oliver.season.peak_month",
    category: "peak",
    kind: "observation",
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const sorted = [...seasonal].sort((a: any, b: any) => Number(b.n) - Number(a.n));
      const top = sorted[0];
      const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const name = monthNames[Number(top.month_num)] || `Month ${top.month_num}`;
      return `Peak month: ${name} (${fmt(Number(top.n))} jobs). Capacity, marketing spend, and crew availability should all anticipate this peak.`;
    },
  },
  {
    id: "oliver.season.trough_month",
    category: "trough",
    kind: "observation",
    dataSources: [],
    priority: 7,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const sorted = [...seasonal].sort((a: any, b: any) => Number(a.n) - Number(b.n));
      const bottom = sorted[0];
      const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const name = monthNames[Number(bottom.month_num)] || `Month ${bottom.month_num}`;
      return `Slowest month: ${name} (${fmt(Number(bottom.n))} jobs). Schedule training, equipment maintenance, marketing planning, and team time off during this trough.`;
    },
  },
  {
    id: "oliver.season.amplitude",
    category: "amplitude",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 8,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const counts = seasonal.map((r: any) => Number(r.n || 0));
      const max = Math.max(...counts);
      const min = Math.min(...counts);
      const avg = counts.reduce((s: number, n: number) => s + n, 0) / counts.length;
      const peakRatio = avg > 0 ? max / avg : 0;
      const troughRatio = avg > 0 ? min / avg : 0;
      if (peakRatio > 2.5) return `Highly seasonal business: peak month is ${peakRatio.toFixed(1)}x average, trough is ${troughRatio.toFixed(1)}x. Cash-flow + capacity planning need to anticipate this swing 60-90 days ahead.`;
      if (peakRatio > 1.5) return `Moderate seasonality: peak ${peakRatio.toFixed(1)}x average, trough ${troughRatio.toFixed(1)}x. Capacity adjustments help but year-round operations remain viable.`;
      return `Low seasonality: peak ${peakRatio.toFixed(1)}x average. Demand is relatively flat — capacity planning can be steady-state.`;
    },
    action: (c: any) => {
      const seasonal = c.seasonal || [];
      const counts = seasonal.map((r: any) => Number(r.n || 0));
      const max = Math.max(...counts);
      const avg = counts.reduce((s: number, n: number) => s + n, 0) / counts.length;
      if (max / Math.max(avg, 1) <= 1.5) return "";
      return `Plan crew capacity for the peak, not the average. Rolling contract help during peak months is cheaper than under-utilised full-time hires during troughs.`;
    },
  },
  {
    id: "oliver.season.season_pair",
    category: "pattern",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 6,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const byMonth = new Map<number, number>();
      for (const r of seasonal) byMonth.set(Number(r.month_num), Number(r.n || 0));
      const seasons: Record<string, number[]> = {
        spring: [3, 4, 5],
        summer: [6, 7, 8],
        fall: [9, 10, 11],
        winter: [12, 1, 2],
      };
      const totals: Record<string, number> = {};
      for (const [name, months] of Object.entries(seasons)) {
        totals[name] = months.reduce((s, m) => s + (byMonth.get(m) || 0), 0);
      }
      const top = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
      const bot = Object.entries(totals).sort((a, b) => a[1] - b[1])[0];
      return `Strongest season: ${top[0]} (${fmt(top[1])} jobs total). Slowest: ${bot[0]} (${fmt(bot[1])} jobs). Service mix often follows seasonal demand — make sure marketing matches the season.`;
    },
  },
  {
    id: "oliver.season.cash_flow_link",
    category: "cash-flow",
    kind: "observation",
    dataSources: [],
    priority: 6,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const counts = seasonal.map((r: any) => Number(r.n || 0));
      const max = Math.max(...counts);
      const avg = counts.reduce((s: number, n: number) => s + n, 0) / counts.length;
      if (max / Math.max(avg, 1) > 1.5) {
        return `Seasonal demand creates seasonal cash-flow pressure. Build a reserve during peak that covers 1.5-2x your trough-month expenses. Most service-business failures happen in the slow season, not in the peak.`;
      }
      return "";
    },
  },
  {
    id: "oliver.season.marketing_timing",
    category: "marketing",
    kind: ["observation", "action"],
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: (c: any) => {
      const seasonal = c.seasonal || [];
      const sorted = [...seasonal].sort((a: any, b: any) => Number(b.n) - Number(a.n));
      const top = sorted[0];
      const monthNum = Number(top.month_num);
      const leadMonthNum = monthNum === 1 ? 11 : monthNum === 2 ? 12 : monthNum - 2;
      const monthNames = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      return `Marketing campaigns should run ~60 days before peak demand to capture early consideration. For your ${monthNames[monthNum]} peak, that means active campaigns in ${monthNames[leadMonthNum]}.`;
    },
    action: () => `Set calendar reminders to begin acquisition + retention campaigns 60 days before your historical peak. Late marketing misses the consideration window.`,
  },
  {
    id: "oliver.season.year_over_year",
    category: "trend",
    kind: "observation",
    dataSources: [],
    priority: 4,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 12,
    observation: () => `With 12+ months of data, year-over-year comparison becomes meaningful. Watch for: peak shifting earlier/later (climate or category change), peak amplitude growing/shrinking (market share moves), trough narrowing (off-season offering working).`,
  },
  {
    id: "oliver.season.weather_link",
    category: "external",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: () => `Weather and seasonal climate shifts can move demand 2-4 weeks earlier or later in any given year. Keep capacity flexible enough to flex with the actual demand curve, not just the calendar.`,
  },
  {
    id: "oliver.season.troff_opportunity",
    category: "opportunity",
    kind: "observation",
    dataSources: [],
    priority: 5,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length >= 4,
    observation: () => `Off-season is the highest-ROI window for: equipment maintenance, crew training, quality-improvement work, customer-relationship investment (review requests, referral asks), and content/SEO production for the next peak.`,
  },
  {
    id: "oliver.season.healthy_summary",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 3,
    appliesWhen: (c: any) => {
      const seasonal = c.seasonal || [];
      if (seasonal.length < 6) return false;
      const counts = seasonal.map((r: any) => Number(r.n || 0));
      const max = Math.max(...counts);
      const avg = counts.reduce((s: number, n: number) => s + n, 0) / counts.length;
      return max / Math.max(avg, 1) < 1.5;
    },
    observation: () => `Demand is relatively flat across the year — capacity planning is straightforward, cash flow is predictable. This is rare for service businesses; protect it with diversified service mix.`,
  },
  {
    id: "oliver.season.benchmark_link",
    category: "summary",
    kind: "observation",
    dataSources: [],
    priority: 2,
    appliesWhen: (c: any) => Array.isArray(c.seasonal) && c.seasonal.length > 0,
    observation: () => `Pair Seasonal Planning with Crew & Capacity to ensure crew size + dispatch patterns match the demand curve. Peak-season under-capacity = lost revenue; trough-season over-capacity = burned cash.`,
  },
];
