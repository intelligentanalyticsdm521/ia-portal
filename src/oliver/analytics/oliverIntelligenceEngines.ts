// oliverIntelligenceEngines — v9.5 OLIVER Intelligence report engines.
//
// 6 engines per spec §5. Each reads OliverEngineInput (same data the
// Trends engines consume). All engines support partial-state operation
// and report their own data gates. Cash Pressure + Demand Forecast use
// simplified extrapolation in v1; Holt-Winters models are a follow-up.

import type { OliverEngineInput } from "./oliverTrendEngines";

export interface IntelligenceReport {
  score: number;
  state: "ok" | "partial" | "insufficient_data" | "locked";
  headline: string;
  scoreInputs: Array<{ key: string; value: number | string | null; weight: number; note?: string }>;
  observations: string[];
  actions: string[];
  dataGap?: string;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const fmt = (n: number | null | undefined) => n == null || !isFinite(n) ? "0" : Math.round(n).toLocaleString();
const pct = (n: number | null | undefined, d = 0) => n == null || !isFinite(n) ? "0%" : `${(n * 100).toFixed(d)}%`;
const dollars = (n: number | null | undefined) => n == null || !isFinite(n) ? "$0" : `$${Math.round(n).toLocaleString()}`;

// ══════════════════════════════════════════════════════════════════════
// 1 — Demand Forecast
// ══════════════════════════════════════════════════════════════════════
// Spec calls for Holt-Winters. v1 uses simpler linear extrapolation
// from job volume. Becomes Holt-Winters when 60+ days of weekly history
// is consistently available.

export function demandForecastEngine(input: OliverEngineInput): IntelligenceReport {
  const statusMap = Object.fromEntries((input.job_status || []).map((r) => [r.status, Number(r.n || 0)]));
  const totalJobs = Object.values(statusMap).reduce((a, b) => a + Number(b), 0);
  const days = Number(input.period_days || 30);
  const seasonal = input.seasonal || [];

  if (totalJobs === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No jobs yet",
      scoreInputs: [],
      observations: ["Demand forecasting requires job history. No jobs recorded yet — the forecast unlocks as you build a baseline."],
      actions: ["Create your first jobs in OLIVER. The forecast unlocks at 30+ jobs with at least 4 weeks of history."],
      dataGap: "Awaiting first jobs.",
    };
  }

  if (totalJobs < 30 || seasonal.length < 4) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${totalJobs}/30 jobs · ${seasonal.length}/4 weeks history`,
      scoreInputs: [
        { key: "total_jobs", value: totalJobs, weight: 0.5 },
        { key: "months_of_history", value: seasonal.length, weight: 0.5 },
      ],
      observations: [
        `${totalJobs} jobs and ${seasonal.length} months of seasonal data so far. The forecast model needs 30+ jobs AND 4+ months of history to project reliably.`,
        `Until then, this report shows trajectory only — not a predictive forecast.`,
      ],
      actions: ["Continue normal operations. The forecast auto-unlocks once thresholds are met."],
      dataGap: `Need ${Math.max(0, 30 - totalJobs)} more jobs and ${Math.max(0, 4 - seasonal.length)} more months.`,
    };
  }

  // Simple linear forecast: avg jobs/week × 8 weeks
  const jobsPerDay = totalJobs / days;
  const jobsPerWeek = jobsPerDay * 7;
  const projectedJobs8wk = Math.round(jobsPerWeek * 8);
  const revenueRecent = input.revenue_recent || { revenue: 0, invoices: 0, paid: 0, overdue: 0 };
  const avgInvoice = Number(revenueRecent.invoices || 0) > 0 ? Number(revenueRecent.revenue || 0) / Number(revenueRecent.invoices || 0) : 0;
  const projectedRevenue = projectedJobs8wk * avgInvoice;

  // Trend direction: compare last half vs first half of seasonal
  let trendDirection: "up" | "down" | "flat" = "flat";
  let trendPct = 0;
  if (seasonal.length >= 2) {
    const half = Math.floor(seasonal.length / 2);
    const firstHalf = seasonal.slice(0, half).reduce((s, r) => s + Number(r.n || 0), 0) / Math.max(half, 1);
    const secondHalf = seasonal.slice(half).reduce((s, r) => s + Number(r.n || 0), 0) / Math.max(seasonal.length - half, 1);
    if (firstHalf > 0) {
      trendPct = ((secondHalf - firstHalf) / firstHalf) * 100;
      trendDirection = trendPct > 5 ? "up" : trendPct < -5 ? "down" : "flat";
    }
  }

  // Crew capacity check
  const crew = input.crew || { workers_with_assignments: 0, avg_jobs_per_worker: 0 };
  const workers = Number(crew.workers_with_assignments || 0);
  const currentCapacityPerWeek = workers > 0 ? (workers * (Number(crew.avg_jobs_per_worker || 0) / days) * 7) : 0;
  const capacityGap = jobsPerWeek - currentCapacityPerWeek;

  const score = Math.round(clamp(60 + (trendDirection === "up" ? 25 : trendDirection === "down" ? -10 : 0) + Math.min(seasonal.length, 12) * 1));

  const observations: string[] = [];
  observations.push(`8-week forecast: ~${fmt(projectedJobs8wk)} jobs at ${jobsPerWeek.toFixed(1)}/week current run-rate · projected revenue ~${dollars(projectedRevenue)} (using ${dollars(avgInvoice)} avg invoice).`);
  observations.push(`Trend: ${trendDirection === "up" ? `growing ${trendPct.toFixed(0)}% month-over-month — capacity planning should target the upper envelope` : trendDirection === "down" ? `declining ${Math.abs(trendPct).toFixed(0)}% month-over-month — investigate before scaling staff` : `flat — predictable capacity needs`}.`);
  if (workers > 0 && currentCapacityPerWeek > 0) {
    observations.push(`Current crew capacity: ~${currentCapacityPerWeek.toFixed(1)} jobs/week (${workers} workers × ${(Number(crew.avg_jobs_per_worker || 0) / days * 7).toFixed(1)} jobs/worker/week). ${capacityGap > 2 ? `Forecast exceeds capacity by ${capacityGap.toFixed(1)} jobs/week — plan to hire or contract.` : capacityGap < -2 ? `Capacity exceeds forecast by ${Math.abs(capacityGap).toFixed(1)} jobs/week — you have headroom.` : "Capacity is aligned with forecast demand."}`);
  }
  observations.push(`v1 model uses linear extrapolation. Switches to Holt-Winters (seasonal decomposition + trend + 80% CI) at 90+ days of weekly history.`);

  const actions: string[] = [];
  if (capacityGap > 2) {
    actions.push(`Start hiring or contract-recruitment now. Service-business hiring takes 30-90 days to be productive; the forecast says you'll need that capacity in 4-6 weeks.`);
  }
  if (trendDirection === "down") {
    actions.push(`Investigate the demand decline. Check ARION/SPARK acquisition reports — if leads are flat but jobs are dropping, the gap is in proposal-to-job conversion (OLIVER Quote Win Rate).`);
  }

  return {
    score,
    state: "ok",
    headline: `${fmt(projectedJobs8wk)} jobs · ${dollars(projectedRevenue)} (8wk)`,
    scoreInputs: [
      { key: "projected_jobs_8wk", value: projectedJobs8wk, weight: 0.4 },
      { key: "projected_revenue_8wk", value: Math.round(projectedRevenue), weight: 0.4 },
      { key: "trend_pct_mom", value: Math.round(trendPct), weight: 0.2 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 2 — Cash Pressure Forecast
// ══════════════════════════════════════════════════════════════════════
// Rolling 30-day cash flow model. Simplified v1 — full Holt-Winters
// on payment timing patterns is a follow-up.

export function cashPressureForecastEngine(input: OliverEngineInput): IntelligenceReport {
  const cash = input.cash_flow || { payments_in: 0, payment_count: 0, avg_days_late: null };
  const revenue = input.revenue_recent || { revenue: 0, invoices: 0, paid: 0, overdue: 0 };
  const inflow = Number(cash.payments_in || 0);
  const paymentCount = Number(cash.payment_count || 0);
  const avgLate = Number(cash.avg_days_late || 0);
  const overdue = Number(revenue.overdue || 0);
  const invoices = Number(revenue.invoices || 0);

  if (paymentCount === 0 && invoices === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No cash flow data yet",
      scoreInputs: [],
      observations: ["Cash flow forecasting requires payment + invoice history. No data yet — connect Stripe and start invoicing to populate the model."],
      actions: ["Verify Stripe webhook delivery. Send your first invoices."],
      dataGap: "Awaiting first invoices + payments.",
    };
  }

  if (paymentCount < 20) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${paymentCount}/20 payments logged`,
      scoreInputs: [{ key: "payment_count", value: paymentCount, weight: 1.0 }],
      observations: [
        `${paymentCount} payments to date. Cash flow forecasting needs 20+ historical payments to model your customers' payment timing patterns reliably.`,
        `Until then, the forecast shows raw signals (overdue count, average days late) without projection.`,
      ],
      actions: ["Continue normal billing. The forecast unlocks once you've processed 20+ payments."],
      dataGap: `${20 - paymentCount} more payments needed for forecasting.`,
    };
  }

  // 30-day projection: assume current invoicing rate continues
  const days = Number(input.period_days || 30);
  const avgInvoiceValue = invoices > 0 ? Number(revenue.revenue || 0) / invoices : 0;
  const invoicesPerDay = invoices / days;
  const projectedInflow30d = Math.round(invoicesPerDay * 30 * avgInvoiceValue * (Number(revenue.paid || 0) / Math.max(invoices, 1)));

  // Pressure: high if (a) lots of overdue, (b) long lag, (c) drop in inflow rate
  const overdueRate = invoices > 0 ? overdue / invoices : 0;
  let pressureScore = 0;
  if (avgLate > 25) pressureScore += 40;
  else if (avgLate > 14) pressureScore += 20;
  if (overdueRate > 0.3) pressureScore += 40;
  else if (overdueRate > 0.15) pressureScore += 20;
  if (pressureScore > 60) pressureScore = clamp(pressureScore, 60, 100);

  // Health score is inverse of pressure
  const healthScore = clamp(100 - pressureScore);

  const observations: string[] = [];
  observations.push(`Past 30 days: ${dollars(inflow)} received across ${fmt(paymentCount)} payments · ${avgLate.toFixed(0)}-day average payment lag.`);
  observations.push(`Next 30 days projection: ~${dollars(projectedInflow30d)} expected inflow at current invoicing rate (${avgInvoiceValue > 0 ? `${invoicesPerDay.toFixed(1)} invoices/day × ${dollars(avgInvoiceValue)} avg × paid-rate` : "rate not yet measurable"}).`);

  if (pressureScore >= 60) {
    observations.push(`Cash pressure: HIGH. ${overdue} overdue invoices + ${avgLate.toFixed(0)}d average lag. Working capital is being absorbed by receivables faster than payments are arriving.`);
  } else if (pressureScore >= 30) {
    observations.push(`Cash pressure: MODERATE. ${overdue} overdue invoices is manageable but tightening payment collection (incentives or stricter terms) would unlock cash now.`);
  } else {
    observations.push(`Cash pressure: LOW. Collection rate is healthy, payment lag is reasonable, overdue share is small.`);
  }

  if (avgLate > 14) {
    observations.push(`Payment lag of ${avgLate.toFixed(0)} days is past your invoice net terms. Customers treat your terms as flexible; tightening (pay-within-7 incentive, late fee at day 14) typically cuts lag 30-50%.`);
  }

  const actions: string[] = [];
  if (pressureScore >= 60) {
    actions.push(`Run a same-day collection sweep on overdue invoices. Personalised outreach (call, not just email) typically recovers 60-80% within a week.`);
    actions.push(`Offer a 1-2% discount for pay-within-7 on new invoices. Compresses cash cycle significantly.`);
  } else if (avgLate > 14) {
    actions.push(`Add payment-reminder automation at 7/14/30 days past due. Closes the timing gap without manual chasing.`);
  }
  actions.push(`v1 model uses linear projection. Switches to Holt-Winters on payment timing at 90+ days of payment history.`);

  return {
    score: healthScore,
    state: "ok",
    headline: pressureScore >= 60 ? `HIGH pressure · ${overdue} overdue` : pressureScore >= 30 ? `Moderate · ${dollars(projectedInflow30d)} (30d)` : `Healthy · ${dollars(projectedInflow30d)} (30d)`,
    scoreInputs: [
      { key: "pressure_score", value: pressureScore, weight: 0.5 },
      { key: "projected_30d_inflow", value: projectedInflow30d, weight: 0.3 },
      { key: "avg_payment_lag_days", value: Math.round(avgLate), weight: 0.2 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 3 — Quote Win Rate Intelligence
// ══════════════════════════════════════════════════════════════════════
// Win rate analysis by service type, quote value band, time-to-decision.
// Single-product engine — no cross-product gates.

export function quoteWinRateIntelligenceEngine(input: OliverEngineInput): IntelligenceReport {
  const q = input.quote_funnel || { total: 0, accepted: 0, rejected: 0, draft: 0, accepted_value: 0, pipeline_value: 0 };
  const total = Number(q.total || 0);
  const accepted = Number(q.accepted || 0);
  const rejected = Number(q.rejected || 0);
  const decided = accepted + rejected;

  if (total === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No quotes recorded",
      scoreInputs: [],
      observations: ["No quote activity. Quote Win Rate Intelligence requires 20+ decided quotes to surface pattern analysis."],
      actions: ["Use OLIVER → Quotes for every new opportunity, even verbal estimates."],
      dataGap: "Awaiting first 20 decided quotes.",
    };
  }

  if (decided < 20) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${decided}/20 decided quotes`,
      scoreInputs: [{ key: "decided_quotes", value: decided, weight: 1.0 }],
      observations: [`${decided} quotes decided. Pattern analysis needs 20+ decisions to be statistically meaningful.`],
      actions: ["Continue quoting. Pattern analysis unlocks at 20 decided quotes."],
      dataGap: `${20 - decided} more decisions needed.`,
    };
  }

  const winRate = decided > 0 ? accepted / decided : 0;
  const avgWonValue = accepted > 0 ? Number(q.accepted_value || 0) / accepted : 0;
  const pipelineValue = Number(q.pipeline_value || 0);
  const expectedPipelineRevenue = pipelineValue * winRate;

  const score = Math.round(clamp(40 + winRate * 100));

  const observations: string[] = [];
  observations.push(`Overall win rate: ${pct(winRate)} (${accepted} won of ${decided} decided). ${winRate >= 0.4 ? "Top-quartile for service businesses." : winRate >= 0.25 ? "Industry-average range." : "Below 25% — process work needed: faster response, tighter qualification, better proposal templates."}`);
  observations.push(`Average won-quote value: ${dollars(avgWonValue)}. ${avgWonValue >= 2000 ? "High-ticket profile — each win is significant dollars." : avgWonValue >= 500 ? "Mid-ticket profile." : "Small-ticket profile — volume + operational efficiency matter most."}`);
  if (pipelineValue > 0) {
    observations.push(`Open pipeline: ${dollars(pipelineValue)}. At your historical ${pct(winRate)} close rate, expected future revenue: ${dollars(expectedPipelineRevenue)}.`);
  }
  observations.push(`v1 model surfaces overall win rate. Full intelligence (by service type, value band, time-to-decision) requires service_type + quote_age tagging on each quote.`);
  observations.push(`Research on quote response speed: quotes responded to within 2 hours close at 50-60% higher rates than next-day responses. Same-day quote turnaround is the highest-leverage win-rate lever available.`);

  const actions: string[] = [];
  if (winRate < 0.3) {
    actions.push(`Run a win-loss review on your last 10 decided quotes. Find the 2-3 patterns that distinguish wins from losses and update your qualifying questions.`);
  }
  actions.push(`Test good/better/best quote templates on next 10 quotes. Industry data: 15-25% win-rate lift over single-option quotes.`);

  return {
    score,
    state: "ok",
    headline: `${pct(winRate)} win · ${dollars(avgWonValue)} avg ticket`,
    scoreInputs: [
      { key: "win_rate_pct", value: Math.round(winRate * 100), weight: 0.5 },
      { key: "avg_won_value", value: Math.round(avgWonValue), weight: 0.3 },
      { key: "expected_pipeline_revenue", value: Math.round(expectedPipelineRevenue), weight: 0.2 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 4 — Customer Retention Risk
// ══════════════════════════════════════════════════════════════════════

export function customerRetentionRiskEngine(input: OliverEngineInput): IntelligenceReport {
  const r = input.retention || { active_customers: 0, at_risk: 0, avg_jobs_per_customer: 0 };
  const active = Number(r.active_customers || 0);
  const atRisk = Number(r.at_risk || 0);
  const avgJobs = Number(r.avg_jobs_per_customer || 0);
  const revenueRecent = input.revenue_recent || { revenue: 0, invoices: 0, paid: 0, overdue: 0 };
  const avgRevenue = active > 0 && Number(revenueRecent.revenue || 0) > 0 ? Number(revenueRecent.revenue || 0) / active : 0;

  if (active === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No active customers",
      scoreInputs: [],
      observations: ["Customer Retention Risk requires customers with job history. Connect customer_id to jobs and start tracking retention."],
      actions: ["Ensure oliver.job has contact_id populated on every completed job."],
      dataGap: "Awaiting active customers.",
    };
  }

  if (active < 20) {
    return {
      score: 0, state: "insufficient_data",
      headline: `${active}/20 active customers`,
      scoreInputs: [{ key: "active_customers", value: active, weight: 1.0 }],
      observations: [`${active} active customers — small base. Retention patterns need 20+ customers with frequency history to be reliable.`],
      actions: ["Continue normal operations. Model unlocks at 20+ customers."],
      dataGap: `${20 - active} more active customers needed.`,
    };
  }

  const atRiskRate = atRisk / active;
  const estimatedRevAtRisk = Math.round(atRisk * avgRevenue);
  const recoverableRev = Math.round(estimatedRevAtRisk * 0.2);  // ~20% reactivation rate
  const score = Math.round(clamp(100 - atRiskRate * 150));

  const observations: string[] = [];
  observations.push(`${fmt(atRisk)} of ${fmt(active)} active customers at risk (${pct(atRiskRate)}). Avg jobs per customer: ${avgJobs.toFixed(2)}.`);
  if (avgRevenue > 0) {
    observations.push(`Revenue at risk: ~${dollars(estimatedRevAtRisk)} (${fmt(atRisk)} customers × ${dollars(avgRevenue)} avg revenue per active). At a typical 20% reactivation rate, recoverable: ~${dollars(recoverableRev)}.`);
  }
  if (atRiskRate > 0.3) {
    observations.push(`At-risk share exceeds 30% — critical. Existing customers churn faster than acquisition replaces; LTV is leaking.`);
  } else if (atRiskRate > 0.15) {
    observations.push(`At-risk share in the 15-30% warning range. Reactivation campaigns recover meaningful revenue at this scale.`);
  } else {
    observations.push(`At-risk share is healthy. Focus on champion-development (repeat customers) rather than reactivation.`);
  }

  if (avgJobs < 1.5) {
    observations.push(`Avg jobs/customer of ${avgJobs.toFixed(2)} means most are one-time. Retention is the highest-leverage LTV play — even moving repeat rate from 1.1 → 1.4 produces 30% LTV lift.`);
  } else if (avgJobs >= 2) {
    observations.push(`Strong repeat-business pattern (${avgJobs.toFixed(1)} jobs/customer). Multi-job customers typically have 3-5x LTV and refer 2-3x more often.`);
  }

  const actions: string[] = [];
  if (atRiskRate > 0.2) {
    actions.push(`Launch a reactivation campaign on the at-risk cohort. Personalised outreach (call or SMS, not just email) typically recovers 20-30% within 30 days.`);
  }
  if (avgJobs < 1.5) {
    actions.push(`Build a post-job retention sequence: thank-you → satisfaction check at 7 days → service-anniversary reminder at 365 days. Compounds repeat-rate over time.`);
  }

  return {
    score,
    state: "ok",
    headline: `${dollars(estimatedRevAtRisk)} at risk · ${pct(atRiskRate)} of base`,
    scoreInputs: [
      { key: "at_risk_share_pct", value: Math.round(atRiskRate * 100), weight: 0.5 },
      { key: "avg_jobs_per_customer", value: Number(avgJobs.toFixed(2)), weight: 0.3 },
      { key: "estimated_recoverable_revenue", value: recoverableRev, weight: 0.2 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 5 — Crew Efficiency Model
// ══════════════════════════════════════════════════════════════════════

export function crewEfficiencyModelEngine(input: OliverEngineInput): IntelligenceReport {
  const crew = input.crew || { workers_with_assignments: 0, avg_jobs_per_worker: 0 };
  const workers = Number(crew.workers_with_assignments || 0);
  const avgJobs = Number(crew.avg_jobs_per_worker || 0);
  const days = Number(input.period_days || 30);
  const lifecycle = input.job_lifecycle || { avg_completion_hours: null, on_time: 0, late: 0 };
  const totalJobs = (input.job_status || []).reduce((s, r) => s + Number(r.n || 0), 0);

  if (workers === 0 || totalJobs < 30) {
    return {
      score: 0, state: "insufficient_data",
      headline: workers === 0 ? "No workers with assignments" : `${totalJobs}/30 jobs needed`,
      scoreInputs: [{ key: "workers", value: workers, weight: 0.5 }, { key: "total_jobs", value: totalJobs, weight: 0.5 }],
      observations: ["Crew efficiency analysis requires 30+ completed jobs with worker assignments + status events. Per-worker metrics emerge once status transitions are tracked."],
      actions: ["Ensure oliver.job_assignment records worker assignment on dispatch. Job_status_events should capture each transition."],
      dataGap: `Need ${Math.max(0, 30 - totalJobs)} more jobs with worker assignments.`,
    };
  }

  const perDay = avgJobs / Math.max(days, 1);
  const onTime = Number(lifecycle.on_time || 0);
  const late = Number(lifecycle.late || 0);
  const onTimeRate = (onTime + late) > 0 ? onTime / (onTime + late) : 0;
  const avgHrs = Number(lifecycle.avg_completion_hours || 0);

  // Utilisation estimate (excludes travel + admin)
  const utilPct = avgHrs > 0 ? clamp(((avgHrs * avgJobs * workers) / (days * 8 * workers)) * 100) : 0;

  const observations: string[] = [];
  observations.push(`${workers} workers averaging ${avgJobs.toFixed(1)} jobs each over ${days} days (${perDay.toFixed(2)}/day per worker). On-time rate: ${pct(onTimeRate)}.`);
  observations.push(`Estimated utilisation: ${Math.round(utilPct)}% of available hours filled with job time. Sustainable ceiling is ~70%; above that, burnout risk rises.`);
  if (avgHrs > 0) {
    observations.push(`Avg cycle time: ${avgHrs.toFixed(1)} hours per job. ${avgHrs < 2 ? "Quick-turnaround service profile." : avgHrs < 8 ? "Single-day service." : avgHrs < 24 ? "Same-day with cleanup." : "Multi-day service profile."}`);
  }
  if (perDay > 1.5) {
    observations.push(`Crew is near or above sustainable capacity. Plan capacity addition (part-time contract crew is fastest at 30-day ramp).`);
  } else if (perDay < 0.5 && workers >= 2) {
    observations.push(`Under-utilised — either volume is light or scheduling isn't packing jobs efficiently. Route optimisation typically recovers 1-2 jobs/day per crew.`);
  } else {
    observations.push(`Utilisation is in the healthy 0.5-1.5 jobs/day per worker range.`);
  }
  observations.push(`v1 model surfaces crew-level signals. Per-worker variance (top performer vs median) emerges from job_status_events as that data accumulates.`);

  const actions: string[] = [];
  if (perDay > 1.5) {
    actions.push(`Start contract-recruitment now. Service-business hiring takes 30-90 days to be productive.`);
  }
  if (onTimeRate < 0.8 && (onTime + late) > 0) {
    actions.push(`On-time rate of ${pct(onTimeRate)} is dragging. Add 15-30 min buffer between scheduled jobs; review top-late service types — often one category accounts for most lateness.`);
  }

  const score = Math.round(clamp(
    (onTimeRate * 100) * 0.4 +
    clamp(utilPct, 0, 70) * 0.3 +
    clamp(workers * 10, 0, 100) * 0.3
  ));

  return {
    score,
    state: "ok",
    headline: `${pct(onTimeRate)} on-time · ${Math.round(utilPct)}% utilisation`,
    scoreInputs: [
      { key: "on_time_rate_pct", value: Math.round(onTimeRate * 100), weight: 0.4 },
      { key: "utilisation_pct", value: Math.round(utilPct), weight: 0.3 },
      { key: "workers", value: workers, weight: 0.3 },
    ],
    observations,
    actions,
  };
}

// ══════════════════════════════════════════════════════════════════════
// 6 — Service Line Profitability
// ══════════════════════════════════════════════════════════════════════
// Revenue-side at launch; margin requires STELLA cost data.

export function serviceLineProfitabilityEngine(input: OliverEngineInput): IntelligenceReport {
  const lines = input.service_line || [];

  if (lines.length === 0) {
    return {
      score: 0, state: "insufficient_data",
      headline: "No service lines tagged",
      scoreInputs: [],
      observations: ["Service line analysis requires jobs to be tagged with service_type. No service-line breakdown yet."],
      actions: ["Configure your Service Catalog and ensure every quote/job selects a service type."],
      dataGap: "Awaiting service-type tagging on jobs.",
    };
  }

  const totalRev = lines.reduce((s, l) => s + Number(l.total_value || 0), 0);
  const totalJobs = lines.reduce((s, l) => s + Number(l.n || 0), 0);
  const avgValue = totalJobs > 0 ? totalRev / totalJobs : 0;
  const top = lines[0];
  const topShare = totalRev > 0 ? Number(top.total_value || 0) / totalRev : 0;
  const top3Rev = lines.slice(0, 3).reduce((s, l) => s + Number(l.total_value || 0), 0);
  const top3Share = totalRev > 0 ? top3Rev / totalRev : 0;

  const score = Math.round(clamp(
    (lines.length >= 3 ? 70 : 40) +
    (topShare < 0.5 ? 20 : topShare < 0.7 ? 10 : -10) +
    (totalRev > 10000 ? 10 : 0)
  ));

  const observations: string[] = [];
  observations.push(`${lines.length} service lines · ${dollars(totalRev)} total revenue across ${fmt(totalJobs)} jobs · ${dollars(avgValue)} avg ticket.`);
  observations.push(`Top line "${top.service_type}" produces ${pct(topShare)} of revenue (${dollars(Number(top.total_value || 0))} from ${fmt(Number(top.n || 0))} jobs · ${dollars(Number(top.avg_value || 0))} avg).`);
  if (lines.length >= 3) {
    observations.push(`Top 3 lines = ${pct(top3Share)} of revenue. ${top3Share > 0.85 ? "Classic 80/20 — long tail consumes overhead without proportional return; audit for retire/bundle candidates." : "Reasonably distributed."}`);
  }
  if (topShare > 0.65) {
    observations.push(`Concentration risk: ${pct(topShare)} of revenue depends on one service line. A demand shift in that category would halve revenue.`);
  }
  observations.push(`v1 surfaces revenue-side analysis. Full margin analysis (cost per service, gross margin) requires STELLA cost data — narrative auto-upgrades when connected.`);

  const actions: string[] = [];
  if (lines.length >= 3) {
    const second = lines[1];
    actions.push(`Highest-leverage cross-sell: introduce "${second.service_type}" to "${top.service_type}" customers post-job. Adjacent-service cross-sell typically achieves 10-20% adoption.`);
  }
  if (topShare > 0.65) {
    actions.push(`Diversify revenue: identify the next service line you could expand. Even modest growth in a second line (15-20% share) materially reduces concentration risk.`);
  }

  return {
    score,
    state: "partial",
    headline: `${lines.length} lines · ${dollars(totalRev)} (revenue-side)`,
    scoreInputs: [
      { key: "service_lines", value: lines.length, weight: 0.3 },
      { key: "total_revenue", value: Math.round(totalRev), weight: 0.4 },
      { key: "top_line_concentration_pct", value: Math.round(topShare * 100), weight: 0.3 },
    ],
    observations,
    actions,
    dataGap: "Connect STELLA for cost data → full margin analysis.",
  };
}

// ══════════════════════════════════════════════════════════════════════
// Engine registry
// ══════════════════════════════════════════════════════════════════════

export const OLIVER_INTEL_ENGINES = {
  demand_forecast: demandForecastEngine,
  cash_pressure: cashPressureForecastEngine,
  quote_win_rate_intel: quoteWinRateIntelligenceEngine,
  customer_retention_risk: customerRetentionRiskEngine,
  crew_efficiency_model: crewEfficiencyModelEngine,
  service_line_profit: serviceLineProfitabilityEngine,
} as const;

export type OliverIntelKey = keyof typeof OLIVER_INTEL_ENGINES;

export function runAllOliverIntelligence(input: OliverEngineInput): Record<OliverIntelKey, IntelligenceReport> {
  return {
    demand_forecast: demandForecastEngine(input),
    cash_pressure: cashPressureForecastEngine(input),
    quote_win_rate_intel: quoteWinRateIntelligenceEngine(input),
    customer_retention_risk: customerRetentionRiskEngine(input),
    crew_efficiency_model: crewEfficiencyModelEngine(input),
    service_line_profit: serviceLineProfitabilityEngine(input),
  };
}
