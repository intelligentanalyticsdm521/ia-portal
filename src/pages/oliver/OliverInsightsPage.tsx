import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Cell,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, TimeRangeSelector, rangeForPreset, type TimeRange,
} from "../../components/oliver/ui";
import { ArgusInsightBox } from "../../components/oliver/ArgusInsightBox";

// ── New category response types ────────────────────────────────────────────
interface QuoteIntel {
  summary: {
    total?: number; accepted?: number; declined?: number; open?: number;
    expired?: number; expired_value?: number; accepted_value?: number;
  };
  by_price_bucket: Array<{ bucket: string; total_count: number; accepted_count: number; conversion_pct: number | null }>;
  time_to_accept: { same_day?: number; one_to_three_days?: number; three_to_seven_days?: number; over_week?: number; avg_hours?: number };
}

interface ProposalPerf {
  summary: {
    total?: number; sent_or_viewed?: number; ever_viewed?: number;
    accepted?: number; declined?: number; expired?: number;
    avg_hours_to_accept?: number;
    open_pipeline?: number; accepted_value?: number; expired_value?: number;
    accepted_with_payment_link?: number;
  };
  time_to_view: { within_1d?: number; one_to_three_d?: number; three_to_seven_d?: number; over_week?: number };
  by_value_bucket: Array<{ bucket: string; total_count: number; accepted_count: number; acceptance_pct: number | null }>;
}

interface SeasonalCrew {
  monthly_revenue: Array<{ month_key: string; yr: number; mo: number; revenue: number; job_count: number }>;
  crew_utilization: Array<{ worker_id: string; worker_name: string; job_count_30d: number; hours_worked_30d: number }>;
  completion: { total_scheduled?: number; completed?: number; cancelled?: number };
}

// ── Types ──────────────────────────────────────────────────────────────────
interface CustomerHealthRow {
  contact_id: string;
  customer_name: string;
  email: string | null;
  company_name?: string | null;
  total_paid: number;
  payment_count?: number;
  payment_count_recent?: number;
  last_payment_at?: string | null;
  days_since_last_payment?: number;
  outstanding?: number;
  overdue?: number;
  overdue_count?: number;
  oldest_overdue_due_date?: string | null;
  days_past_due?: number;
}

interface CustomerHealth {
  top_spenders: CustomerHealthRow[];
  at_risk: CustomerHealthRow[];
  slow_payers: CustomerHealthRow[];
}

interface OfferingRow {
  offering_name: string;
  job_count: number;
  revenue: number;
  labor_cost: number;
  labor_hours: number;
  profit: number;
  margin_pct: number | null;
}

interface CashFlowBucket {
  week_offset: number;
  week_label: string;
  outstanding_amount: number;
  outstanding_count: number;
  subscription_amount: number;
  subscription_count: number;
  total_expected: number;
}

interface CashFlowSummary {
  total_expected_90d: number;
  total_outstanding: number;
  total_subscriptions: number;
}

interface CashFlow {
  buckets: CashFlowBucket[];
  summary: CashFlowSummary;
}

function fmtMoney(n?: number | null, dec = 0) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtMoneyShort(n?: number | null) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}
function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

export function OliverInsightsPage() {
  const { get, ready } = useOliverApi();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [health, setHealth] = useState<CustomerHealth | null>(null);
  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [cashflow, setCashflow] = useState<CashFlow | null>(null);
  const [quoteIntel, setQuoteIntel] = useState<QuoteIntel | null>(null);
  const [proposalPerf, setProposalPerf] = useState<ProposalPerf | null>(null);
  const [seasonal, setSeasonal] = useState<SeasonalCrew | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    const qs = rangeToQuery(range);
    (async () => {
      setLoading(true); setError(null);
      try {
        const [h, o, c, qi, pp, sc] = await Promise.all([
          get<CustomerHealth>("/reports/customer-health"),
          get<{ offerings: OfferingRow[] }>(`/reports/service-profitability${qs}`),
          get<CashFlow>("/reports/cash-flow-forecast"),
          get<QuoteIntel>(`/reports/quote-conversion-intelligence${qs}`).catch(() => null),
          get<ProposalPerf>(`/reports/proposal-performance${qs}`).catch(() => null),
          get<SeasonalCrew>("/reports/seasonal-crew-performance").catch(() => null),
        ]);
        setHealth(h);
        setOfferings(o.offerings || []);
        setCashflow(c);
        setQuoteIntel(qi);
        setProposalPerf(pp);
        setSeasonal(sc);
      } catch (err) { setError(err); }
      finally { setLoading(false); }
    })();
  }, [get, ready, range]);

  const topOfferings = useMemo(() => offerings.slice(0, 8), [offerings]);
  const losingOfferings = useMemo(() => offerings.filter((o) => Number(o.profit) < 0), [offerings]);

  // ── ARGUS observation generators (data-driven) ──────────────────────────
  const customerHealthArgus = useMemo(() => {
    if (!health) return { observations: [] as string[], actions: [] as string[] };
    const top = health.top_spenders ?? [];
    const atRisk = health.at_risk ?? [];
    const slowPayers = health.slow_payers ?? [];
    const observations: string[] = [];
    const actions: string[] = [];
    if (top.length >= 5) {
      const top5Total = top.slice(0, 5).reduce((s, c) => s + Number(c.total_paid || 0), 0);
      const allTotal = top.reduce((s, c) => s + Number(c.total_paid || 0), 0);
      if (allTotal > 0) {
        const top5Pct = Math.round((top5Total / allTotal) * 100);
        if (top5Pct >= 50) {
          observations.push(`Your top 5 customers account for ${top5Pct}% of revenue — classic Pareto distribution. Any one of them churning would be significant. When did you last personally reach out to each?`);
        }
      }
    }
    if (atRisk.length > 0) {
      const totalLifetime = atRisk.reduce((s, c) => s + Number(c.total_paid || 0), 0);
      observations.push(`${atRisk.length} previously-active customer${atRisk.length === 1 ? "" : "s"} ${atRisk.length === 1 ? "has" : "have"} gone quiet for 60+ days (${fmtMoney(totalLifetime)} lifetime value at risk).`);
      actions.push(`Trigger a personal check-in with each at-risk customer. A 15-minute call is 3-5× more effective than another marketing email.`);
    }
    if (slowPayers.length > 0) {
      const overdueTotal = slowPayers.reduce((s, c) => s + Number(c.overdue || 0), 0);
      observations.push(`${fmtMoney(overdueTotal)} sitting in past-due invoices across ${slowPayers.length} customer${slowPayers.length === 1 ? "" : "s"}. The oldest overdue invoice has been waiting ${slowPayers[0]?.days_past_due || 0} days.`);
      actions.push(`Send reminder emails to your slow payers today. After 30 days of inaction, collection probability drops by 28%.`);
    }
    if (top.length > 0 && observations.length < 2) {
      observations.push(`${top.length} customer${top.length === 1 ? "" : "s"} ${top.length === 1 ? "is" : "are"} actively paying. Your top spender is ${top[0]?.customer_name || "—"} at ${fmtMoney(top[0]?.total_paid || 0)} lifetime.`);
    }
    return { observations, actions };
  }, [health]);

  const serviceProfitArgus = useMemo(() => {
    const observations: string[] = [];
    const actions: string[] = [];
    if (offerings.length === 0) return { observations, actions };

    if (losingOfferings.length > 0) {
      const worstName = losingOfferings[0].offering_name;
      const worst = losingOfferings[0];
      observations.push(`${worstName} is running at ${worst.margin_pct != null ? `${Number(worst.margin_pct).toFixed(0)}% margin` : "negative margin"} — labor cost (${fmtMoney(worst.labor_cost)}) exceeds revenue (${fmtMoney(worst.revenue)}). Review pricing or labor allocation.`);
      actions.push(`Raise the price on ${worstName} by 10-15% on the next quote. Customers who chose it once will likely accept a modest increase before shopping around.`);
    }
    const high = offerings.find((o) => (o.margin_pct ?? 0) >= 50);
    if (high) {
      observations.push(`${high.offering_name} delivers your strongest margin at ${high.margin_pct != null ? Number(high.margin_pct).toFixed(0) : "—"}%. Selling 2 more of these per month is worth ${fmtMoney(Number(high.profit) * 2 / Math.max(1, high.job_count))} in net profit.`);
      actions.push(`Promote ${high.offering_name} on your customer portal or in your next email campaign — it's your most profitable service line.`);
    }
    const lowMargin = offerings.filter((o) => o.margin_pct != null && o.margin_pct < 20 && o.margin_pct >= 0);
    if (lowMargin.length >= 2) {
      observations.push(`${lowMargin.length} service line${lowMargin.length === 1 ? "" : "s"} run at under 20% margin: ${lowMargin.slice(0, 3).map((o) => o.offering_name).join(", ")}${lowMargin.length > 3 ? "…" : ""}. These are vulnerable to any labor cost increase.`);
    }
    return { observations, actions };
  }, [offerings, losingOfferings]);

  const cashFlowArgus = useMemo(() => {
    if (!cashflow) return { observations: [] as string[], actions: [] as string[] };
    const observations: string[] = [];
    const actions: string[] = [];
    const sum = cashflow.summary ?? ({} as Partial<CashFlowSummary>);
    const buckets = cashflow.buckets ?? [];
    if (Number(sum.total_expected_90d ?? 0) > 0) {
      observations.push(`${fmtMoney(sum.total_expected_90d)} is expected to come in over the next 90 days — ${fmtMoney(sum.total_outstanding)} from outstanding invoices + ${fmtMoney(sum.total_subscriptions)} from subscription renewals.`);
    }
    // Find weeks ≥ $X
    const heavyWeeks = buckets.filter((b) => Number(b?.total_expected ?? 0) > 2500);
    if (heavyWeeks.length >= 3) {
      observations.push(`${heavyWeeks.length} weeks in your forecast have ${fmtMoney(2500)}+ of expected inflow. Plan major spending around those peaks.`);
    }
    const gap = buckets.findIndex((b, i) => i > 0 && Number(b?.total_expected ?? 0) === 0);
    if (gap > 0 && gap < 13) {
      observations.push(`Week ${gap} has no scheduled inflow — a potential cash dip ${gap} week${gap === 1 ? "" : "s"} out. Schedule outreach to fill it.`);
      actions.push(`Send a marketing nudge this week to fill the ${gap}-week-out cash gap. Sequence: re-engage a previous customer or run a limited-time offer.`);
    }
    if (Number(sum.total_outstanding ?? 0) > Number(sum.total_subscriptions ?? 0)) {
      actions.push(`${fmtMoney(sum.total_outstanding)} sits in outstanding invoices. Reminders on the oldest ones will accelerate the cash conversion cycle.`);
    }
    return { observations, actions };
  }, [cashflow]);

  const quoteIntelArgus = useMemo(() => {
    if (!quoteIntel) return { observations: [] as string[], actions: [] as string[] };
    const observations: string[] = [];
    const actions: string[] = [];
    const s = quoteIntel.summary ?? {};
    const decided = (s.accepted || 0) + (s.declined || 0);
    if (decided > 0) {
      const rate = Math.round((s.accepted || 0) * 100 / decided);
      if (rate < 60) {
        observations.push(`Your quote acceptance rate is ${rate}% — below the 60% industry average. Quotes with itemized line items typically convert 23% better than lump-sum quotes.`);
        actions.push(`Add a "What's included" section to your quote template. Customers cite clarity as a top reason for choosing one vendor over another.`);
      } else {
        observations.push(`Your quote acceptance rate is ${rate}% — above the 60% industry average. Your pricing and presentation are working.`);
      }
    }
    if ((s.expired || 0) >= 3 && (s.expired_value || 0) > 0) {
      observations.push(`${s.expired} expired quotes from the last period totaled ${fmtMoney(s.expired_value)} in lost pipeline. A re-engagement email to expired-quote contacts recovers 15-20% of that on average.`);
      actions.push(`Set up an automated re-engagement sequence for expired quotes — most service businesses leave this revenue on the table.`);
    }
    // Find low-converting price bucket
    const worstBucket = (quoteIntel.by_price_bucket ?? [])
      .filter((b) => Number(b?.total_count ?? 0) >= 3 && b?.conversion_pct != null)
      .sort((a, b) => (Number(a.conversion_pct) - Number(b.conversion_pct)))[0];
    if (worstBucket && Number(worstBucket.conversion_pct) < 40) {
      observations.push(`Quotes in the ${worstBucket.bucket} range convert at only ${worstBucket.conversion_pct != null ? Number(worstBucket.conversion_pct).toFixed(0) : "—"}% — the weakest segment. Consider a payment plan option to lift these.`);
    }
    const avg = Number(quoteIntel.time_to_accept?.avg_hours || 0);
    if (avg > 72) {
      observations.push(`Your average quote sits ${Math.round(avg / 24)} days before acceptance. Following up within 24 hours of sending doubles conversion speed.`);
    }
    return { observations, actions };
  }, [quoteIntel]);

  const proposalPerfArgus = useMemo(() => {
    if (!proposalPerf) return { observations: [] as string[], actions: [] as string[] };
    const observations: string[] = [];
    const actions: string[] = [];
    const s = proposalPerf.summary ?? {};
    if ((s.ever_viewed || 0) >= 3) {
      const viewedAndDecided = (s.accepted || 0) + (s.declined || 0);
      if (viewedAndDecided > 0) {
        const viewToAccept = Math.round((s.accepted || 0) * 100 / Math.max(1, s.ever_viewed || 0));
        observations.push(`${viewToAccept}% of viewed proposals end in acceptance. Of all sent proposals, ${Math.round((s.ever_viewed || 0) * 100 / Math.max(1, s.total || 1))}% are actually opened.`);
      }
    }
    const ttv = proposalPerf.time_to_view ?? {};
    const total = (ttv.within_1d || 0) + (ttv.one_to_three_d || 0) + (ttv.three_to_seven_d || 0) + (ttv.over_week || 0);
    if (total >= 3 && (ttv.within_1d || 0) >= 1) {
      const fastPct = Math.round((ttv.within_1d || 0) * 100 / total);
      observations.push(`${fastPct}% of clients open your proposal within 24 hours. Fast openers accept at 2-3× the rate of clients who delay — your timely follow-up matters.`);
    }
    if ((s.expired || 0) > 0 && (s.expired_value || 0) > 0) {
      observations.push(`${s.expired} proposal${s.expired === 1 ? "" : "s"} expired without action — ${fmtMoney(s.expired_value)} in pipeline that walked away.`);
      actions.push(`Set a 7-day-out reminder on every sent proposal to nudge before expiry.`);
    }
    if ((s.accepted_with_payment_link || 0) > 0 && (s.accepted || 0) > 0) {
      const payRate = Math.round((s.accepted_with_payment_link || 0) * 100 / (s.accepted || 1));
      if (payRate >= 50) {
        observations.push(`${payRate}% of your accepted proposals included a Stripe payment link — strong signal that immediate-payment friction is what wins deals.`);
      } else if (payRate < 25) {
        actions.push(`Attach a Stripe payment link to every accepted proposal. Customers who can pay immediately convert at significantly higher rates.`);
      }
    }
    if ((s.total || 0) === 0) {
      observations.push(`No proposals sent in this range yet. Start sending — proposals convert 2-3× better than informal estimates.`);
    }
    return { observations, actions };
  }, [proposalPerf]);

  const seasonalArgus = useMemo(() => {
    if (!seasonal) return { observations: [] as string[], actions: [] as string[] };
    const observations: string[] = [];
    const actions: string[] = [];
    const rows = seasonal.monthly_revenue ?? [];
    if (rows.length >= 12) {
      // Find peak month in last 12
      const last12 = rows.slice(-12);
      const peak = last12.reduce((max, r) => r.revenue > max.revenue ? r : max, last12[0]);
      if (peak.revenue > 0) {
        const monthName = new Date(peak.yr, peak.mo - 1, 1).toLocaleDateString(undefined, { month: "long" });
        observations.push(`${monthName} is your peak revenue month over the last 12 (${fmtMoney(peak.revenue)}). Begin pre-season marketing 6 weeks before to capture the rush.`);
        actions.push(`Schedule your top promotional campaign for ${peak.mo > 1 ? new Date(peak.yr, peak.mo - 2, 1).toLocaleDateString(undefined, { month: "long" }) : "December"} — one month ahead of your historical peak.`);
      }

      // YoY check
      if (rows.length >= 13) {
        const thisMonth = rows[rows.length - 1];
        const lastYr = rows[rows.length - 13];
        if (lastYr && lastYr.revenue > 0 && thisMonth.revenue > 0) {
          const yoy = Math.round((thisMonth.revenue - lastYr.revenue) * 100 / lastYr.revenue);
          if (yoy >= 10) {
            observations.push(`This month is up ${yoy}% YoY (${fmtMoney(thisMonth.revenue)} vs ${fmtMoney(lastYr.revenue)} a year ago). Your growth is accelerating.`);
          } else if (yoy <= -10) {
            observations.push(`This month is down ${Math.abs(yoy)}% YoY. Investigate: customer mix? pricing? competitor? seasonality shift?`);
            actions.push(`Run a same-month YoY comparison with your top customers — find out who isn't coming back and why.`);
          }
        }
      }
    }

    // Crew utilization spread
    const crew = (seasonal.crew_utilization ?? []).filter((c) => Number(c?.hours_worked_30d ?? 0) > 0);
    if (crew.length >= 2) {
      const max = crew[0];
      const min = crew[crew.length - 1];
      if (max.hours_worked_30d > 0 && Number(max.hours_worked_30d) >= 2 * Number(min.hours_worked_30d)) {
        observations.push(`${max.worker_name} worked ${Math.round(Number(max.hours_worked_30d))} hours in the last 30 days vs ${min.worker_name}'s ${Math.round(Number(min.hours_worked_30d))} — rebalancing dispatch could improve quality and retention.`);
        actions.push(`Review the next 2 weeks of scheduling — assign more jobs to ${min.worker_name} and offload from ${max.worker_name}.`);
      }
    }

    // Completion rate
    const c = seasonal.completion ?? {};
    if ((c.total_scheduled || 0) > 10) {
      const cancelPct = Math.round((c.cancelled || 0) * 100 / Math.max(1, c.total_scheduled || 0));
      if (cancelPct > 5) {
        observations.push(`${cancelPct}% of jobs scheduled in the last 90 days were cancelled. Industry target is under 5% — review cancellation reasons and consider a deposit policy.`);
        actions.push(`Require a deposit on bookings worth more than $${500}. This reduces no-show / late-cancel rates by 40-60% in service businesses.`);
      }
    }
    return { observations, actions };
  }, [seasonal]);

  return (
    <OliverPageWrapper title="Insights" subtitle="What the data is telling you" error={error} loading={loading}>
      <PageHeader
        title="Insights"
        subtitle="Customer health, service profitability, and where your cash is heading."
        actions={<TimeRangeSelector value={range} onChange={setRange} />}
      />

      {/* ── Headline narrative banner ─────────────────────────────────── */}
      {health && (
        <InsightsBanner health={health} cashflow={cashflow} />
      )}

      {/* ── Customer health — 3-card grid ─────────────────────────────── */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Customer health</div>
            <div className="card-sub">Who needs attention and who's keeping the lights on</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <HealthListCard
            title="Top spenders"
            icon="🏆"
            tone="emerald"
            empty="No paid invoices yet."
            rows={health?.top_spenders || []}
            renderMetric={(r) => (
              <>
                <div style={{ fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmtMoney(r.total_paid)}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>{r.payment_count} payments</div>
              </>
            )}
          />
          <HealthListCard
            title="At-risk"
            icon="📉"
            tone="amber"
            empty="No customers have gone quiet — everyone's still active."
            rows={health?.at_risk || []}
            renderMetric={(r) => (
              <>
                <div style={{ fontWeight: 700, color: "#D97706", fontSize: 13 }}>
                  {r.days_since_last_payment || 0}d quiet
                </div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>Last paid {fmtDate(r.last_payment_at)}</div>
              </>
            )}
            caption="Paid in prior 6 mo, silent for 60+ days"
          />
          <HealthListCard
            title="Slow payers"
            icon="⏰"
            tone="rose"
            empty="No overdue invoices. Nice."
            rows={health?.slow_payers || []}
            renderMetric={(r) => (
              <>
                <div style={{ fontWeight: 700, color: "#B91C1C", fontFamily: "monospace" }}>{fmtMoney(r.overdue)}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>{r.days_past_due || 0}d past due</div>
              </>
            )}
            caption="Outstanding invoices past their due date"
          />
        </div>

        <ArgusInsightBox
          domainLabel="Customer Health Intelligence"
          observations={customerHealthArgus.observations}
          actions={customerHealthArgus.actions}
        />
      </div>

      {/* ── Service profitability ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Service profitability</div>
            <div className="card-sub">Where your margin actually lives</div>
          </div>
          <Link to="/app/services/oliver_ia_insights_trends" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>Full reports →</Link>
        </div>
        {topOfferings.length === 0 ? (
          <div style={{ padding: "20px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
            No completed jobs in this range yet. Once you complete and invoice jobs, this fills in.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={Math.max(220, topOfferings.length * 32 + 60)}>
              <BarChart data={topOfferings} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v) => fmtMoneyShort(v)} />
                <YAxis type="category" dataKey="offering_name" stroke="#64748B" fontSize={11} width={150} />
                <Tooltip
                  formatter={(v) => fmtMoney(Number(v), 2)}
                  contentStyle={{ borderRadius: 6, fontSize: 11 }}
                />
                <Bar dataKey="profit" name="Profit" radius={[0, 4, 4, 0]}>
                  {topOfferings.map((o, i) => (
                    <Cell key={i} fill={Number(o.profit) < 0 ? "#DC2626" : Number(o.profit) > 0 && (o.margin_pct ?? 0) >= 30 ? "#059669" : "#1A7DB5"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Table follows so the user can scan precise numbers */}
            <table className="tbl" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Service</th>
                  <th style={{ textAlign: "right" }}>Jobs</th>
                  <th style={{ textAlign: "right" }}>Revenue</th>
                  <th style={{ textAlign: "right" }}>Labor cost</th>
                  <th style={{ textAlign: "right" }}>Profit</th>
                  <th style={{ textAlign: "right" }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {topOfferings.map((o) => (
                  <tr key={o.offering_name}>
                    <td style={{ fontWeight: 500 }}>{o.offering_name}</td>
                    <td style={{ textAlign: "right" }}>{o.job_count}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(o.revenue, 2)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#B91C1C" }}>{fmtMoney(o.labor_cost, 2)}</td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 600,
                                color: Number(o.profit) < 0 ? "#B91C1C" : "#059669" }}>
                      {fmtMoney(o.profit, 2)}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#5A7A8A" }}>
                      {o.margin_pct != null ? `${Number(o.margin_pct).toFixed(0)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {losingOfferings.length > 0 && (
              <div style={{
                marginTop: 12, padding: 10, fontSize: 12,
                background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B",
              }}>
                <strong>{losingOfferings.length} offering{losingOfferings.length === 1 ? "" : "s"} losing money:</strong>{" "}
                {losingOfferings.map((o) => o.offering_name).join(", ")}. Consider raising the price or reviewing the labor cost.
              </div>
            )}
          </>
        )}

        <ArgusInsightBox
          domainLabel="Service Profitability Intelligence"
          observations={serviceProfitArgus.observations}
          actions={serviceProfitArgus.actions}
        />
      </div>

      {/* ── Cash flow forecast ────────────────────────────────────────── */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Cash flow forecast</div>
            <div className="card-sub">Next 13 weeks — expected inflow from outstanding invoices + subscription renewals</div>
          </div>
          {cashflow && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>
                {fmtMoney(cashflow.summary.total_expected_90d)}
              </div>
              <div style={{ fontSize: 10, color: "#5A7A8A" }}>expected in next 90 days</div>
            </div>
          )}
        </div>
        {!cashflow || cashflow.summary.total_expected_90d === 0 ? (
          <div style={{ padding: "20px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
            No outstanding invoices or upcoming subscription renewals in the next 90 days.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={cashflow.buckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="week_label" stroke="#64748B" fontSize={10} />
                <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => fmtMoneyShort(v)} />
                <Tooltip formatter={(v) => fmtMoney(Number(v), 2)} contentStyle={{ borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="outstanding_amount" stackId="a" fill="#F59E0B" name="Outstanding invoices" radius={[0, 0, 0, 0]} />
                <Bar dataKey="subscription_amount" stackId="a" fill="#1A7DB5" name="Subscription renewals" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 20, marginTop: 10, fontSize: 12, justifyContent: "center" }}>
              <Legend color="#F59E0B" label="Outstanding" amount={cashflow.summary.total_outstanding} />
              <Legend color="#1A7DB5" label="Subscription MRR" amount={cashflow.summary.total_subscriptions} />
            </div>
          </>
        )}

        <ArgusInsightBox
          domainLabel="Cash Flow Intelligence"
          observations={cashFlowArgus.observations}
          actions={cashFlowArgus.actions}
        />
      </div>

      {/* ── Cat 4: Quote-to-Job Conversion Intelligence ───────────────── */}
      {quoteIntel && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Quote-to-job conversion</div>
              <div className="card-sub">Where quotes accept, decline, and stall</div>
            </div>
          </div>
          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="stat-lbl">Sent</div>
              <div className="stat-val">{quoteIntel.summary.total ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Accepted</div>
              <div className="stat-val" style={{ color: "#059669" }}>{quoteIntel.summary.accepted ?? 0}</div>
              <div className="stat-delta neu">{fmtMoney(quoteIntel.summary.accepted_value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Declined</div>
              <div className="stat-val" style={{ color: "#9333EA" }}>{quoteIntel.summary.declined ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Expired pipeline</div>
              <div className="stat-val" style={{ color: "#D97706" }}>{fmtMoney(quoteIntel.summary.expired_value)}</div>
              <div className="stat-delta neu">{quoteIntel.summary.expired ?? 0} quote{quoteIntel.summary.expired === 1 ? "" : "s"}</div>
            </div>
          </div>

          {quoteIntel.by_price_bucket.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, margin: "12px 0 8px" }}>
                Conversion by price range
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={quoteIntel.by_price_bucket}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="bucket" stroke="#64748B" fontSize={11} />
                  <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="conversion_pct" name="Conversion %" radius={[4, 4, 0, 0]}>
                    {quoteIntel.by_price_bucket.map((b, i) => (
                      <Cell key={i} fill={(b.conversion_pct ?? 0) >= 60 ? "#059669" : (b.conversion_pct ?? 0) >= 30 ? "#1A7DB5" : "#D97706"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          <ArgusInsightBox
            domainLabel="Quote Conversion Intelligence"
            observations={quoteIntelArgus.observations}
            actions={quoteIntelArgus.actions}
          />
        </div>
      )}

      {/* ── Cat 5: Proposal Performance Intelligence ──────────────────── */}
      {proposalPerf && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Proposal performance</div>
              <div className="card-sub">View-to-accept rate + time-to-decide patterns</div>
            </div>
            <Link to="/app/services/oliver_proposals" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>Manage proposals →</Link>
          </div>

          <div className="stat-row" style={{ marginBottom: 14 }}>
            <div className="stat-card">
              <div className="stat-lbl">Sent</div>
              <div className="stat-val">{proposalPerf.summary.total ?? 0}</div>
              <div className="stat-delta neu">{proposalPerf.summary.ever_viewed ?? 0} viewed</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Accepted</div>
              <div className="stat-val" style={{ color: "#059669" }}>{proposalPerf.summary.accepted ?? 0}</div>
              <div className="stat-delta neu">{fmtMoney(proposalPerf.summary.accepted_value)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Open pipeline</div>
              <div className="stat-val">{fmtMoney(proposalPerf.summary.open_pipeline)}</div>
              <div className="stat-delta neu">awaiting decision</div>
            </div>
            <div className="stat-card">
              <div className="stat-lbl">Avg time to accept</div>
              <div className="stat-val">
                {proposalPerf.summary.avg_hours_to_accept
                  ? Number(proposalPerf.summary.avg_hours_to_accept) >= 24
                    ? `${Math.round(Number(proposalPerf.summary.avg_hours_to_accept) / 24)}d`
                    : `${Math.round(Number(proposalPerf.summary.avg_hours_to_accept))}h`
                  : "—"}
              </div>
              <div className="stat-delta neu">from send → accept</div>
            </div>
          </div>

          {/* Time-to-view distribution */}
          {(() => {
            const ttv = proposalPerf.time_to_view ?? {};
            const total = (ttv.within_1d || 0) + (ttv.one_to_three_d || 0) + (ttv.three_to_seven_d || 0) + (ttv.over_week || 0);
            if (total === 0) return null;
            const buckets = [
              { label: "Within 1 day", count: ttv.within_1d || 0, color: "#059669" },
              { label: "1–3 days", count: ttv.one_to_three_d || 0, color: "#1A7DB5" },
              { label: "3–7 days", count: ttv.three_to_seven_d || 0, color: "#F59E0B" },
              { label: "> 7 days", count: ttv.over_week || 0, color: "#DC2626" },
            ];
            return (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, margin: "6px 0 8px" }}>
                  Time-to-view distribution
                </div>
                <div style={{ display: "flex", height: 28, borderRadius: 6, overflow: "hidden", border: "1px solid #E2E8F0" }}>
                  {buckets.map((b) => {
                    const w = (b.count / total) * 100;
                    if (w === 0) return null;
                    return (
                      <div key={b.label} title={`${b.label}: ${b.count}`}
                        style={{
                          width: `${w}%`, background: b.color, color: "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                        }}>
                        {w > 12 && b.count}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8, fontSize: 11 }}>
                  {buckets.map((b) => (
                    <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />
                      <span style={{ color: "#0B1C24" }}>{b.label}</span>
                      <span style={{ color: "#5A7A8A" }}>· {b.count}</span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          <ArgusInsightBox
            domainLabel="Proposal Performance Intelligence"
            observations={proposalPerfArgus.observations}
            actions={proposalPerfArgus.actions}
          />
        </div>
      )}

      {/* ── Cat 6: Seasonal Revenue Patterns + Crew Performance ───────── */}
      {seasonal && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Seasonal patterns + crew performance</div>
              <div className="card-sub">24-month revenue + last-30-day crew load</div>
            </div>
          </div>

          {/* 24-month revenue heatmap (simple bar chart) */}
          {seasonal.monthly_revenue.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, margin: "6px 0 8px" }}>
                Revenue by month (last 24)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={seasonal.monthly_revenue}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month_key" stroke="#64748B" fontSize={9} interval={1} />
                  <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v) => fmtMoneyShort(v)} />
                  <Tooltip formatter={(v) => fmtMoney(Number(v), 2)} contentStyle={{ borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="revenue" name="Revenue" radius={[4, 4, 0, 0]} fill="#1A7DB5" />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {/* Crew utilization table */}
          {seasonal.crew_utilization.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
                Crew load — last 30 days
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Worker</th>
                    <th style={{ textAlign: "right" }}>Jobs</th>
                    <th style={{ textAlign: "right" }}>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {seasonal.crew_utilization.slice(0, 10).map((c) => (
                    <tr key={c.worker_id}>
                      <td style={{ fontWeight: 500 }}>{c.worker_name}</td>
                      <td style={{ textAlign: "right" }}>{c.job_count_30d}</td>
                      <td style={{ textAlign: "right", fontFamily: "monospace" }}>{Number(c.hours_worked_30d ?? 0).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Completion summary */}
          {seasonal.completion && (seasonal.completion.total_scheduled ?? 0) > 0 && (
            <div style={{ marginTop: 14, padding: 12, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12, color: "#5A7A8A" }}>
              <strong style={{ color: "#0B1C24" }}>Job completion (last 90 days):</strong>{" "}
              {seasonal.completion.completed ?? 0} of {seasonal.completion.total_scheduled ?? 0} completed
              {(seasonal.completion.cancelled ?? 0) > 0 && (
                <> · <span style={{ color: "#D97706" }}>{seasonal.completion.cancelled} cancelled</span></>
              )}
            </div>
          )}

          <ArgusInsightBox
            domainLabel="Seasonal & Crew Intelligence"
            observations={seasonalArgus.observations}
            actions={seasonalArgus.actions}
          />
        </div>
      )}
    </OliverPageWrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InsightsBanner({ health, cashflow }: { health: CustomerHealth; cashflow: CashFlow | null }) {
  // Narrative sentence summarizing the state of the business
  const atRisk = health.at_risk ?? [];
  const slowPayers = health.slow_payers ?? [];
  const atRiskCount = atRisk.length;
  const slowPayCount = slowPayers.length;
  const slowPayAmount = slowPayers.reduce((s, r) => s + Number(r.overdue || 0), 0);
  const next30 = (cashflow?.buckets ?? []).slice(0, 5).reduce((s, b) => s + Number(b?.total_expected || 0), 0);

  let tone: "ok" | "warn" | "alert" = "ok";
  let sentence = "Everything's healthy. Top spenders are paying on time and your service mix is profitable.";

  if (slowPayCount > 0 && slowPayAmount > 1000) {
    tone = "alert";
    sentence = `${fmtMoney(slowPayAmount)} sitting in past-due invoices across ${slowPayCount} customer${slowPayCount === 1 ? "" : "s"}. Chase those first.`;
  } else if (atRiskCount > 0) {
    tone = "warn";
    sentence = `${atRiskCount} previously-active customer${atRiskCount === 1 ? "" : "s"} ${atRiskCount === 1 ? "has" : "have"} gone quiet. Consider a check-in.`;
  } else if (next30 > 0) {
    sentence = `~${fmtMoney(next30)} expected to come in over the next 5 weeks from open invoices + subscriptions.`;
  }

  const palette = {
    ok:    { bg: "linear-gradient(90deg, #D1FAE5 0%, #ECFDF5 100%)", border: "#A7F3D0", text: "#065F46", icon: "✓" },
    warn:  { bg: "linear-gradient(90deg, #FEF3C7 0%, #FEF9C3 100%)", border: "#FDE68A", text: "#92400E", icon: "ℹ" },
    alert: { bg: "linear-gradient(90deg, #FEE2E2 0%, #FECACA 100%)", border: "#FCA5A5", text: "#991B1B", icon: "!" },
  }[tone];

  return (
    <div style={{
      padding: 16, marginBottom: 14, borderRadius: 10,
      background: palette.bg, border: `1px solid ${palette.border}`,
      display: "flex", alignItems: "center", gap: 16,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        background: palette.text, color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontWeight: 700, fontSize: 18, flexShrink: 0,
      }}>{palette.icon}</div>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: palette.text, lineHeight: 1.5 }}>
        {sentence}
      </div>
    </div>
  );
}

interface HealthListCardProps {
  title: string;
  icon: string;
  tone: "emerald" | "amber" | "rose";
  empty: string;
  rows: CustomerHealthRow[];
  caption?: string;
  renderMetric: (r: CustomerHealthRow) => React.ReactNode;
}
function HealthListCard({ title, icon, tone, empty, rows, caption, renderMetric }: HealthListCardProps) {
  const headerColor = {
    emerald: "#059669",
    amber: "#D97706",
    rose: "#B91C1C",
  }[tone];
  return (
    <div style={{ background: "#FAFBFC", border: "1px solid #E5E7EB", borderRadius: 8, padding: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 700, color: headerColor }}>{title}</div>
      </div>
      {caption && <div style={{ fontSize: 10, color: "#5A7A8A", marginBottom: 8, fontStyle: "italic" }}>{caption}</div>}
      {rows.length === 0 ? (
        <div style={{ padding: "12px 0", fontSize: 11, color: "#5A7A8A", fontStyle: "italic" }}>{empty}</div>
      ) : (
        <div>
          {rows.slice(0, 5).map((r) => (
            <Link
              key={r.contact_id}
              to={`/app/services/oliver_contacts?focus=${r.contact_id}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 0", borderBottom: "1px solid rgba(0,0,0,0.05)",
                fontSize: 12, color: "#0B1C24", textDecoration: "none",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.company_name || r.customer_name || "—"}
                </div>
                {r.email && (
                  <div style={{ fontSize: 10, color: "#5A7A8A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.email}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>{renderMetric(r)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Legend({ color, label, amount }: { color: string; label: string; amount: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: 12, height: 12, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ color: "#0B1C24", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>{fmtMoney(amount)}</span>
    </div>
  );
}
