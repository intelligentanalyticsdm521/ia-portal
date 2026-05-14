// oliverTrendEngines.ts — 8 OLIVER trend engines (v5.17).
//
// Mirror of arion/sparkTrendEngines.ts for OLIVER. Each engine answers
// one business question and emits a scored ReportAnalysis.

export interface OliverEngineInput {
  period_days: number;
  job_status?: Array<{ status: string; n: number }> | null;
  job_lifecycle?: { avg_completion_hours: number | null; on_time: number; late: number } | null;
  revenue_recent?: { revenue: number; invoices: number; paid: number; overdue: number } | null;
  cash_flow?: { payments_in: number; payment_count: number; avg_days_late: number | null } | null;
  quote_funnel?: { total: number; accepted: number; rejected: number; draft: number; accepted_value: number; pipeline_value: number } | null;
  retention?: { active_customers: number; at_risk: number; avg_jobs_per_customer: number } | null;
  crew?: { workers_with_assignments: number; avg_jobs_per_worker: number } | null;
  service_line?: Array<{ service_type: string; n: number; avg_value: number; total_value: number }> | null;
  seasonal?: Array<{ month_num: number; n: number }> | null;
}

export interface ReportAnalysis {
  score: number;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  contextNote?: string;
}

const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const dollars = (n: number | null | undefined) => n == null || !isFinite(n) ? "$0" : `$${Math.round(n).toLocaleString()}`;
const pct = (n: number | null | undefined, digits = 1) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(digits)}%`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function scoreFromBenchmark(actual: number, benchmark: number, optimum = benchmark * 2): number {
  if (!benchmark || benchmark <= 0) return 50;
  if (actual <= 0) return 0;
  if (actual <= benchmark) return clamp((actual / benchmark) * 60, 0, 60);
  return clamp(60 + ((actual - benchmark) / Math.max(1, optimum - benchmark)) * 40, 60, 100);
}

// ── 1 — Operations Health ────────────────────────────────────────────
export function operationsHealthEngine(input: OliverEngineInput): ReportAnalysis {
  const byStatus = Object.fromEntries((input.job_status || []).map((r) => [r.status, r.n]));
  const completed = byStatus.completed || 0;
  const scheduled = byStatus.scheduled || 0;
  const inProgress = byStatus.in_progress || 0;
  const cancelled = byStatus.cancelled || 0;
  const total = (input.job_status || []).reduce((s, r) => s + r.n, 0);
  const lifecycle = input.job_lifecycle || { avg_completion_hours: null, on_time: 0, late: 0 };
  const onTimeRate = (lifecycle.on_time + lifecycle.late) > 0 ? lifecycle.on_time / (lifecycle.on_time + lifecycle.late) : null;
  const cancelRate = total > 0 ? cancelled / total : null;

  const completionScore = total > 0 ? clamp((completed / total) * 150, 0, 100) : 30;
  const onTimeScore = onTimeRate != null ? clamp(onTimeRate * 110, 0, 100) : 50;
  const cancelScore = cancelRate != null ? clamp(100 - cancelRate * 400, 0, 100) : 70;
  const cycleScore = lifecycle.avg_completion_hours != null ? scoreFromBenchmark(48, lifecycle.avg_completion_hours, 24) : 50;

  const score = Math.round(completionScore * 0.30 + onTimeScore * 0.35 + cancelScore * 0.20 + cycleScore * 0.15);
  const observations: string[] = [];
  if (total > 0) {
    observations.push(`Jobs this period: ${fmt(total)} total — ${fmt(completed)} completed, ${fmt(scheduled)} scheduled, ${fmt(inProgress)} in progress, ${fmt(cancelled)} cancelled.`);
    if (onTimeRate != null) {
      observations.push(`On-time completion rate: ${pct(onTimeRate)} (${fmt(lifecycle.on_time)} on time, ${fmt(lifecycle.late)} late). ${onTimeRate < 0.7 ? "Below industry expectation — schedule reliability is a leading retention indicator." : "Healthy on-time rate."}`);
    }
    if (lifecycle.avg_completion_hours != null) {
      observations.push(`Average dispatch-to-completion: ${lifecycle.avg_completion_hours.toFixed(1)} hours. ${lifecycle.avg_completion_hours > 72 ? "Long cycle time — investigate dispatch bottlenecks or under-resourcing." : "Healthy cycle time."}`);
    }
    if (cancelRate != null && cancelRate > 0.1) {
      observations.push(`Cancellation rate of ${pct(cancelRate)} is above 10% — cancellations are revenue you've already booked the cost for. Track the cancellation reason to identify the leak.`);
    }
  } else {
    observations.push("No job activity this period. Either no jobs have been created in OLIVER yet, or jobs are not being status-tracked correctly.");
  }

  const actions: string[] = [];
  if (onTimeRate != null && onTimeRate < 0.7) actions.push(`Audit the schedule buffer for your top 3 service types — late jobs typically mean scheduled time slots are too tight or dispatch routes aren't optimised.`);
  if (cancelRate != null && cancelRate > 0.1) actions.push(`Add a cancellation-reason field to job records and review the top reasons weekly. Three usual suspects: rescheduling, price objections, no-show.`);
  if (lifecycle.avg_completion_hours != null && lifecycle.avg_completion_hours > 72) actions.push(`Pull a job lifecycle report — find the longest-running open jobs and assign a swarm to close them this week.`);
  if (!actions.length) actions.push("Operations health is strong — focus on Revenue Performance (next report).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "completion_rate_pct", value: total > 0 ? Math.round((completed / total) * 100) : null, weight: 0.30 },
      { key: "on_time_rate_pct", value: onTimeRate != null ? Math.round(onTimeRate * 100) : null, weight: 0.35 },
      { key: "cancel_rate_pct", value: cancelRate != null ? Math.round(cancelRate * 100) : null, weight: 0.20 },
      { key: "avg_completion_hours", value: lifecycle.avg_completion_hours != null ? Number(lifecycle.avg_completion_hours.toFixed(1)) : null, weight: 0.15 },
    ],
    observations,
    actions,
  };
}

// ── 2 — Revenue Performance ──────────────────────────────────────────
export function revenuePerformanceEngine(input: OliverEngineInput): ReportAnalysis {
  const r = input.revenue_recent || { revenue: 0, invoices: 0, paid: 0, overdue: 0 };
  const paidRate = r.invoices > 0 ? r.paid / r.invoices : null;
  const overdueRate = r.invoices > 0 ? r.overdue / r.invoices : null;

  const revenueScore = scoreFromBenchmark(r.revenue, 10000, 100000);
  const paidScore = paidRate != null ? clamp(paidRate * 110, 0, 100) : 50;
  const overdueScore = overdueRate != null ? clamp(100 - overdueRate * 300, 0, 100) : 70;
  const invoiceScore = scoreFromBenchmark(r.invoices, 10, 100);

  const score = Math.round(revenueScore * 0.40 + paidScore * 0.25 + overdueScore * 0.15 + invoiceScore * 0.20);
  const observations: string[] = [];
  if (r.invoices > 0) {
    observations.push(`Revenue this period: ${dollars(r.revenue)} across ${fmt(r.invoices)} invoices. Paid: ${fmt(r.paid)} (${pct(paidRate || 0)}). Overdue: ${fmt(r.overdue)} (${pct(overdueRate || 0)}).`);
    if (overdueRate != null && overdueRate > 0.15) {
      observations.push(`${pct(overdueRate)} of invoices are overdue — A/R is leaking. Each overdue invoice past 30 days has only a ~70% chance of ever being collected at full value.`);
    }
    if (paidRate != null && paidRate < 0.6) {
      observations.push(`Only ${pct(paidRate)} of invoices have been paid. Either you're invoicing too late in the job cycle, or your collection cadence is lax.`);
    }
  } else {
    observations.push("No invoices issued this period. Either jobs aren't generating invoices (check job → invoice automation), or no jobs have completed yet.");
  }

  const actions: string[] = [];
  if (overdueRate != null && overdueRate > 0.15) actions.push(`Enable automatic 7/14/21-day overdue reminders. The biggest single A/R lift comes from systematic follow-up — no human discretion required.`);
  if (paidRate != null && paidRate < 0.6) actions.push(`Move to invoice-on-completion. Cards on file + same-day invoicing typically lifts paid rate to 75-85% within 60 days.`);
  if (r.invoices < 10) actions.push(`Increase invoice cadence. Most service businesses bill weekly or invoice on completion — anything less and revenue compounds against you.`);
  if (!actions.length) actions.push("Revenue performance is healthy — combine with Cash Flow report to spot incoming-payment timing risks.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "revenue", value: r.revenue, weight: 0.40 },
      { key: "paid_rate_pct", value: paidRate != null ? Math.round(paidRate * 100) : null, weight: 0.25 },
      { key: "overdue_rate_pct", value: overdueRate != null ? Math.round(overdueRate * 100) : null, weight: 0.15 },
      { key: "invoice_count", value: r.invoices, weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── 3 — Cash Flow ────────────────────────────────────────────────────
export function cashFlowEngine(input: OliverEngineInput): ReportAnalysis {
  const c = input.cash_flow || { payments_in: 0, payment_count: 0, avg_days_late: null };
  const r = input.revenue_recent || { revenue: 0, invoices: 0, paid: 0, overdue: 0 };
  const collectionRatio = r.revenue > 0 ? c.payments_in / r.revenue : null;
  const avgDaysLate = c.avg_days_late || 0;

  const collectionScore = collectionRatio != null ? clamp(collectionRatio * 110, 0, 100) : 50;
  const speedScore = clamp(100 - Math.max(0, avgDaysLate) * 2, 0, 100);
  const volumeScore = scoreFromBenchmark(c.payment_count, 10, 100);

  const score = Math.round(collectionScore * 0.50 + speedScore * 0.30 + volumeScore * 0.20);
  const observations: string[] = [];
  if (c.payment_count > 0) {
    observations.push(`Payments in: ${dollars(c.payments_in)} across ${fmt(c.payment_count)} transactions. ${collectionRatio != null ? `Collection ratio: ${pct(collectionRatio)} of invoiced amount.` : ""}`);
    if (avgDaysLate > 7) {
      observations.push(`Average payment is ${avgDaysLate.toFixed(1)} days past due date. Every day late is interest you forgo and risk you absorb.`);
    } else if (avgDaysLate < -7) {
      observations.push(`Customers paying ${Math.abs(avgDaysLate).toFixed(1)} days early on average — excellent. Consider thanking your top early-payers with a small loyalty perk.`);
    }
    if (collectionRatio != null && collectionRatio < 0.5) {
      observations.push(`Collection ratio below 50% means most invoiced amount hasn't been collected yet. Verify your invoice timing — the more invoices you issue at job-complete, the higher this ratio runs.`);
    }
  } else {
    observations.push("No payments recorded this period. Check that Stripe / payment gateway sync is firing.");
  }

  const actions: string[] = [];
  if (avgDaysLate > 7) actions.push(`Offer a 2% early-payment discount on net-30 invoices — the discount cost is dwarfed by the cost of late-paying carry.`);
  if (collectionRatio != null && collectionRatio < 0.5) actions.push(`Move to ACH + card-on-file for repeat customers — auto-pay closes the cash gap.`);
  if (c.payment_count < 10) actions.push(`Verify the payment-gateway webhook is reaching iadm-webhooks. Missing payment events show up here as artificially low payment counts.`);
  if (!actions.length) actions.push("Cash flow is healthy — focus on revenue growth (Revenue Performance).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "collection_ratio_pct", value: collectionRatio != null ? Math.round(collectionRatio * 100) : null, weight: 0.50 },
      { key: "avg_days_late", value: avgDaysLate != null ? Number(avgDaysLate.toFixed(1)) : null, weight: 0.30 },
      { key: "payment_count", value: c.payment_count, weight: 0.20 },
    ],
    observations,
    actions,
  };
}

// ── 4 — Quote & Win Rate ─────────────────────────────────────────────
export function quoteWinRateEngine(input: OliverEngineInput): ReportAnalysis {
  const q = input.quote_funnel || { total: 0, accepted: 0, rejected: 0, draft: 0, accepted_value: 0, pipeline_value: 0 };
  const decided = q.accepted + q.rejected;
  const winRate = decided > 0 ? q.accepted / decided : null;
  const conversionPotential = q.total > 0 ? q.accepted_value / Math.max(1, q.total) : null;

  const winScore = winRate != null ? clamp(winRate * 200, 0, 100) : 40;
  const volumeScore = scoreFromBenchmark(q.total, 5, 50);
  const pipelineScore = scoreFromBenchmark(q.pipeline_value, 5000, 50000);

  const score = Math.round(winScore * 0.50 + volumeScore * 0.20 + pipelineScore * 0.30);
  const observations: string[] = [];
  if (q.total > 0) {
    observations.push(`Quotes this period: ${fmt(q.total)} total — ${fmt(q.accepted)} accepted, ${fmt(q.rejected)} rejected, ${fmt(q.draft)} draft.`);
    if (winRate != null) {
      observations.push(`Win rate: ${pct(winRate)}. ${winRate >= 0.5 ? "Above-average win rate." : winRate >= 0.3 ? "Win rate has room to improve." : "Win rate is below industry average — review your quoting approach."}`);
    }
    observations.push(`Accepted-quote value: ${dollars(q.accepted_value)}. Open pipeline value: ${dollars(q.pipeline_value)}.`);
  } else {
    observations.push("No quotes this period. If you're booking jobs without quotes, you're losing the ability to track win/loss by service type and price tier.");
  }

  const actions: string[] = [];
  if (winRate != null && winRate < 0.3) actions.push(`Build good/better/best quote tiers. Single-option quotes anchor low — three-option quotes typically lift win rate 15-25%.`);
  if (q.draft > q.accepted + q.rejected) actions.push(`${fmt(q.draft)} quotes are still in draft. Either get them out the door or close them as lost. Open drafts skew your reporting.`);
  if (q.pipeline_value > q.accepted_value * 2) actions.push(`Open pipeline value is high relative to accepted — push a follow-up cadence to convert pipeline before it ages out.`);
  if (!actions.length) actions.push("Quote conversion is healthy — combine with Service Line Performance to identify which services have the strongest win rate.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "win_rate_pct", value: winRate != null ? Math.round(winRate * 100) : null, weight: 0.50 },
      { key: "quote_volume", value: q.total, weight: 0.20 },
      { key: "pipeline_value", value: q.pipeline_value, weight: 0.30 },
    ],
    observations,
    actions,
  };
}

// ── 5 — Customer Retention ───────────────────────────────────────────
export function customerRetentionEngine(input: OliverEngineInput): ReportAnalysis {
  const r = input.retention || { active_customers: 0, at_risk: 0, avg_jobs_per_customer: 0 };
  const atRiskRate = r.active_customers > 0 ? r.at_risk / r.active_customers : null;
  const repeatRate = r.avg_jobs_per_customer || 0;

  const atRiskScore = atRiskRate != null ? clamp(100 - atRiskRate * 200, 0, 100) : 50;
  const repeatScore = scoreFromBenchmark(repeatRate, 1.5, 4);

  const score = Math.round(atRiskScore * 0.55 + repeatScore * 0.45);
  const observations: string[] = [];
  if (r.active_customers > 0) {
    observations.push(`Active customer base: ${fmt(r.active_customers)} customers, ${fmt(r.at_risk)} at risk (>60 days since last job).`);
    if (atRiskRate != null && atRiskRate > 0.25) {
      observations.push(`${pct(atRiskRate)} of active customers are at-risk for churn. Reactivation campaigns at the 45-day mark typically recover 30-40% of at-risk customers.`);
    }
    observations.push(`Average jobs per customer: ${repeatRate.toFixed(2)}. ${repeatRate >= 2 ? "Repeat business is the engine — strong retention." : repeatRate >= 1.5 ? "Moderate repeat rate." : "Most customers are one-and-done — significant LTV opportunity in retention."}`);
  } else {
    observations.push("No tracked customers yet. Once jobs accumulate, retention signals will populate.");
  }

  const actions: string[] = [];
  if (atRiskRate != null && atRiskRate > 0.25) actions.push(`Launch a 45-day "we miss you" automation triggered when last_job_date hits 45 days. Include a service-specific offer (seasonal maintenance, inspection, tune-up).`);
  if (repeatRate < 1.5 && r.active_customers > 0) actions.push(`Build a post-job follow-up sequence that mentions the typical next-service interval — most service businesses leave 30-50% of repeat revenue on the table by not asking.`);
  if (r.active_customers < 10) actions.push(`Customer count is low — focus on acquisition (SPARK Marketing Attribution) before doubling down on retention.`);
  if (!actions.length) actions.push("Retention is strong — explore Service Line Performance for cross-sell expansion opportunities.");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "at_risk_rate_pct", value: atRiskRate != null ? Math.round(atRiskRate * 100) : null, weight: 0.55 },
      { key: "avg_jobs_per_customer", value: Number(repeatRate.toFixed(2)), weight: 0.45 },
    ],
    observations,
    actions,
  };
}

// ── 6 — Crew & Capacity ──────────────────────────────────────────────
export function crewCapacityEngine(input: OliverEngineInput): ReportAnalysis {
  const c = input.crew || { workers_with_assignments: 0, avg_jobs_per_worker: 0 };
  const utilizationScore = scoreFromBenchmark(c.avg_jobs_per_worker, 10, 40);
  const teamScore = scoreFromBenchmark(c.workers_with_assignments, 2, 10);
  const score = Math.round(utilizationScore * 0.60 + teamScore * 0.40);
  const observations: string[] = [];
  if (c.workers_with_assignments > 0) {
    observations.push(`Active crew: ${fmt(c.workers_with_assignments)} workers received assignments this period. Avg ${c.avg_jobs_per_worker.toFixed(1)} jobs per worker.`);
    if (c.avg_jobs_per_worker < 5) {
      observations.push(`Avg jobs per worker is low — either you're over-staffed for current demand or your dispatch isn't distributing jobs efficiently.`);
    } else if (c.avg_jobs_per_worker > 30) {
      observations.push(`Avg jobs per worker is high — your top crews may be at capacity. Plan hiring 30-60 days ahead of breaking-point.`);
    }
  } else {
    observations.push("No crew assignments tracked. Either you operate solo or worker assignments aren't being recorded — verify the dispatch flow.");
  }
  const actions: string[] = [];
  if (c.avg_jobs_per_worker < 5 && c.workers_with_assignments > 1) actions.push(`Audit dispatch — if most jobs flow to 1-2 workers while others sit idle, you're paying for capacity you're not using.`);
  if (c.avg_jobs_per_worker > 30) actions.push(`Start the hiring funnel for one additional crew now — the lead time to fill a service role is typically 4-8 weeks.`);
  if (!actions.length) actions.push("Crew utilisation is balanced — focus on Service Line performance for revenue-mix optimisation.");
  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "avg_jobs_per_worker", value: Number(c.avg_jobs_per_worker.toFixed(1)), weight: 0.60 },
      { key: "active_workers", value: c.workers_with_assignments, weight: 0.40 },
    ],
    observations, actions,
  };
}

// ── 7 — Service Line Performance ─────────────────────────────────────
export function serviceLinePerformanceEngine(input: OliverEngineInput): ReportAnalysis {
  const sl = (input.service_line || []).filter((s) => s.service_type);
  const totalValue = sl.reduce((s, r) => s + Number(r.total_value || 0), 0);
  const top = sl[0];
  const topShare = totalValue > 0 && top ? Number(top.total_value) / totalValue : 0;
  const diversityScore = sl.length === 0 ? 20 : clamp((1 - Math.min(1, topShare)) * 70 + sl.length * 6, 0, 100);
  const volumeScore = scoreFromBenchmark(totalValue, 10000, 100000);
  const score = Math.round(diversityScore * 0.50 + volumeScore * 0.50);
  const observations: string[] = [];
  if (sl.length === 0) {
    observations.push("No service-type tagging on jobs. Tag every job with its service type so this report can surface profitability by service.");
  } else {
    observations.push(`Tracking ${sl.length} service types totalling ${dollars(totalValue)}. Top service: ${top.service_type} (${dollars(top.total_value)}, avg ${dollars(top.avg_value)} per job, ${pct(topShare)} share).`);
    if (topShare > 0.6) {
      observations.push(`Revenue concentration: ${pct(topShare)} of revenue from one service. A demand shift in that service would halve your business.`);
    }
  }
  const actions: string[] = [];
  if (topShare > 0.6) actions.push(`Identify your second-best service-margin opportunity and invest in promoting it — even a 10% shift to a second service materially reduces concentration risk.`);
  if (sl.length < 3) actions.push(`Catalogue your service offerings. Most service businesses unconsciously offer 5-8 services but only price 1-2 — a service catalogue typically lifts attach rate.`);
  if (!actions.length) actions.push("Service mix is diversified — combine with Quote & Win Rate to find which services have the strongest unit economics.");
  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "service_type_count", value: sl.length, weight: 0.50 },
      { key: "total_revenue", value: totalValue, weight: 0.50 },
    ],
    observations, actions,
  };
}

// ── 8 — Seasonal Planning ────────────────────────────────────────────
export function seasonalPlanningEngine(input: OliverEngineInput): ReportAnalysis {
  const monthly = (input.seasonal || []).filter((m) => m.month_num != null);
  const totalJobs = monthly.reduce((s, r) => s + r.n, 0);
  const avg = monthly.length > 0 ? totalJobs / monthly.length : 0;
  const peakMonth = monthly.sort((a, b) => b.n - a.n)[0];
  const lowMonth = monthly.sort((a, b) => a.n - b.n)[0];
  const variance = monthly.length > 0 ? monthly.reduce((s, m) => s + Math.pow(m.n - avg, 2), 0) / monthly.length : 0;
  const peakToLowRatio = lowMonth && lowMonth.n > 0 && peakMonth ? peakMonth.n / lowMonth.n : null;

  const dataScore = monthly.length >= 6 ? clamp(monthly.length * 10, 0, 100) : 30;
  const stabilityScore = peakToLowRatio != null ? clamp(100 - (peakToLowRatio - 1) * 30, 0, 100) : 50;
  const score = Math.round(dataScore * 0.50 + stabilityScore * 0.50);

  const observations: string[] = [];
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (monthly.length === 0) {
    observations.push("No historical job data yet. Seasonal patterns surface after 12 months of jobs.");
  } else {
    observations.push(`Last 12 months: ${fmt(totalJobs)} jobs across ${monthly.length} active months. Avg ${avg.toFixed(1)} jobs/month.`);
    if (peakMonth && lowMonth && peakMonth.month_num !== lowMonth.month_num) {
      observations.push(`Peak: ${months[peakMonth.month_num]} (${fmt(peakMonth.n)} jobs). Low: ${months[lowMonth.month_num]} (${fmt(lowMonth.n)} jobs). Peak-to-low ratio: ${peakToLowRatio?.toFixed(1) || "n/a"}.`);
    }
    if (peakToLowRatio != null && peakToLowRatio > 3) {
      observations.push(`Highly seasonal business — peak is more than 3× your slow months. Plan staffing, inventory, and marketing spend around this curve, not flat across the year.`);
    }
  }
  const actions: string[] = [];
  if (peakToLowRatio != null && peakToLowRatio > 3 && lowMonth) actions.push(`Build a counter-cyclical offering for ${months[lowMonth.month_num]} — even a low-margin off-season service smooths cash flow.`);
  if (monthly.length < 12) actions.push(`Continue tracking — seasonal Intelligence reports (forecasting) unlock once you have 12+ months of data.`);
  if (!actions.length) actions.push("Demand is stable across the year — focus on growth (Revenue Performance + Service Line).");

  return {
    score: clamp(score, 0, 100),
    scoreInputs: [
      { key: "months_with_data", value: monthly.length, weight: 0.50 },
      { key: "peak_to_low_ratio", value: peakToLowRatio != null ? Number(peakToLowRatio.toFixed(1)) : null, weight: 0.50 },
    ],
    observations, actions,
  };
}

// ── Synthesis: OLIVER Trend Score ────────────────────────────────────
export function oliverPresenceEngine(scores: Record<string, number>): ReportAnalysis {
  const WEIGHTS = {
    ops_health: 0.18, revenue_perf: 0.18, cash_flow: 0.15, quote_win_rate: 0.12,
    retention: 0.10, crew_capacity: 0.10, service_line: 0.10, seasonal: 0.07,
  } as const;
  const weighted = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + (scores[k] || 0) * w, 0);
  const LABELS: Record<string, string> = {
    ops_health: "Operations Health", revenue_perf: "Revenue Performance",
    cash_flow: "Cash Flow", quote_win_rate: "Quote & Win Rate",
    retention: "Customer Retention", crew_capacity: "Crew & Capacity",
    service_line: "Service Line Performance", seasonal: "Seasonal Planning",
  };
  const gaps = Object.entries(WEIGHTS).map(([k, w]) => ({ key: k, score: scores[k] || 0, weight: w }))
    .sort((a, b) => (a.score * a.weight) - (b.score * b.weight))
    .slice(0, 3);
  return {
    score: Math.round(weighted),
    scoreInputs: Object.entries(WEIGHTS).map(([k, w]) => ({ key: k, value: scores[k] || 0, weight: w })),
    observations: [
      `Overall OLIVER Trend Score: ${Math.round(weighted)}/100. ${weighted >= 70 ? "Above average for service operations — operations are humming." : weighted >= 50 ? "Average overall — uneven across categories." : "Below average — significant operational opportunities."}`,
      `Top 3 impact-weighted gaps: ${gaps.map((g) => `${LABELS[g.key]} (${g.score}/100)`).join(" → ")}.`,
    ],
    actions: gaps.map((g) => `Open ${LABELS[g.key]} for specific observations and actions.`),
  };
}

export interface AllOliverReports {
  ops_health: ReportAnalysis; revenue_perf: ReportAnalysis; cash_flow: ReportAnalysis;
  quote_win_rate: ReportAnalysis; retention: ReportAnalysis; crew_capacity: ReportAnalysis;
  service_line: ReportAnalysis; seasonal: ReportAnalysis; presence: ReportAnalysis;
}

export function runAllOliverReports(input: OliverEngineInput): AllOliverReports {
  const ops_health = operationsHealthEngine(input);
  const revenue_perf = revenuePerformanceEngine(input);
  const cash_flow = cashFlowEngine(input);
  const quote_win_rate = quoteWinRateEngine(input);
  const retention = customerRetentionEngine(input);
  const crew_capacity = crewCapacityEngine(input);
  const service_line = serviceLinePerformanceEngine(input);
  const seasonal = seasonalPlanningEngine(input);
  const presence = oliverPresenceEngine({
    ops_health: ops_health.score, revenue_perf: revenue_perf.score, cash_flow: cash_flow.score,
    quote_win_rate: quote_win_rate.score, retention: retention.score,
    crew_capacity: crew_capacity.score, service_line: service_line.score, seasonal: seasonal.score,
  });
  return { ops_health, revenue_perf, cash_flow, quote_win_rate, retention, crew_capacity, service_line, seasonal, presence };
}
