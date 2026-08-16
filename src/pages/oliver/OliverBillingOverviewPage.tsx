import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import {
  PageHeader, TimeRangeSelector, rangeForPreset, type TimeRange,
} from "../../components/oliver/ui";

interface PaymentMethodBucket { method: string; amount: number; count: number; }
interface TopCustomer { contact_id: string; customer_name: string | null; email: string | null; total_paid: number; payment_count: number; }
interface RecentPayment { payment_id: string; amount: number; type: string; paid_at: string; invoice_number?: string; customer_name?: string; }
interface UpcomingSub { subscription_id: string; service_name: string; amount: number; current_period_end: string; status: string; billing_interval?: string; }

interface BillingOverview {
  revenue: number;
  outstanding: number;
  overdue: number;
  paid_count: number;
  open_count: number;
  overdue_count: number;
  draft_count: number;
  prior_revenue: number;
  prior_paid_count: number;
  revenue_delta_pct: number | null;
  payment_method_breakdown: PaymentMethodBucket[];
  top_customers: TopCustomer[];
  coupon_impact: { redemption_count: number; total_discounted: number };
  mrr_estimate: number;
  upcoming_subscriptions: UpcomingSub[];
  recent_payments: RecentPayment[];
}

interface BillingTrendBucket { month: string; revenue: number; paid_count: number; }

function fmtMoney(n?: number | null, dec = 0) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}
function fmtMoneyShort(n?: number | null) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}
function fmtRelative(d?: string) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) {
    const future = Math.abs(days);
    if (future === 0) return "today"; if (future === 1) return "tomorrow"; return `in ${future} days`;
  }
  if (days === 0) return "today"; if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(d).toLocaleDateString();
}
function rangeToQuery(r: TimeRange): string {
  const params = new URLSearchParams();
  if (r.fromISO) params.set("from", r.fromISO);
  if (r.toISO) params.set("to", r.toISO);
  const s = params.toString();
  return s ? `?${s}` : "";
}

const METHOD_LABELS: Record<string, string> = {
  card: "Card",
  check: "Check",
  cash: "Cash",
  wire: "Wire",
  ach_manual: "ACH (manual)",
  other: "Other",
  all: "Stripe",
};

// Pie slice colors — staged from brand teal to accent so the donut feels coherent
const METHOD_COLORS = ["#1A7DB5", "#0C4A60", "#10B981", "#F59E0B", "#9333EA", "#94A3B8"];

export function OliverBillingOverviewPage() {
  // Reports covering THIS function (Brandon 2026-08-14). Above any early
  // return — a hook below one runs on some renders only.
  const insightsPayload = useProductInsightsPayload('oliver');

  const { get, ready } = useOliverApi();
  const [range, setRange] = useState<TimeRange>(() => rangeForPreset("last_30_days"));
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [trend, setTrend] = useState<BillingTrendBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    const qs = rangeToQuery(range);
    (async () => {
      setLoading(true); setError(null);
      try {
        const [b, t] = await Promise.all([
          get<BillingOverview>(`/overview/billing${qs}`),
          get<BillingTrendBucket[]>(`/overview/billing-trend${qs}`),
        ]);
        setBilling(b);
        setTrend(t || []);
      } catch (err) { setError(err); }
      finally { setLoading(false); }
    })();
  }, [get, ready, range]);

  // Combined activity feed: merge recent payments + recent refunds (already
  // in recent_payments, differentiated by .type).
  const activity = useMemo(() => billing?.recent_payments ?? [], [billing]);

  const totalMethodAmount = useMemo(
    () => (billing?.payment_method_breakdown || []).reduce((s, m) => s + Number(m.amount), 0),
    [billing],
  );

  const ageingBuckets = useMemo(() => {
    if (!billing) return [];
    const open = Number(billing.outstanding || 0);
    const overdue = Number(billing.overdue || 0);
    const onTime = Math.max(0, open - overdue);
    return [
      { label: "Within terms", amount: onTime, color: "#10B981" },
      { label: "Overdue", amount: overdue, color: "#F97316" },
    ];
  }, [billing]);

  const deltaPct = billing?.revenue_delta_pct ?? null;
  const deltaIsPositive = (deltaPct ?? 0) >= 0;
  const overdueCount = billing?.overdue_count || 0;

  return (
    <OliverPageWrapper title="Billing Overview" subtitle="Where your money is" error={error} loading={loading}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_revenue_by_service', label: 'Revenue by service' },
        { id: 'oliver_overdue_invoices', label: 'Who to chase' },
        { id: 'oliver_invoice_aging', label: 'Receivables aging' },
        { id: 'oliver_subscription_health', label: 'Recurring revenue' },
      ]} />
      <PageHeader
        title="Billing Overview"
        subtitle="Revenue trends, outstanding receivables, subscription health, and recent activity in one place."
        actions={<TimeRangeSelector value={range} onChange={setRange} />}
      />

      {/* ── At-risk banner ───────────────────────────────────────────────── */}
      {overdueCount > 0 && (
        <div style={{
          padding: 16, marginBottom: 14, borderRadius: 10,
          background: "linear-gradient(90deg, #FEF3C7 0%, #FEF9C3 100%)",
          border: "1px solid #FDE68A",
          display: "flex", alignItems: "center", gap: 16,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%", background: "#F59E0B",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: 18, flexShrink: 0,
          }}>!</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#92400E", fontSize: 14 }}>
              {fmtMoney(billing?.overdue, 2)} is past due across {overdueCount} invoice{overdueCount === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 12, color: "#78350F", marginTop: 2 }}>
              The longer it sits, the harder it is to collect. Send a reminder or pick up the phone.
            </div>
          </div>
          <Link
            to="/app/services/oliver_reminders"
            style={{
              padding: "8px 16px", borderRadius: 8, background: "#92400E", color: "#fff",
              fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap",
            }}
          >
            Send reminders →
          </Link>
        </div>
      )}

      {/* ── Hero stat row ────────────────────────────────────────────────── */}
      <div className="stat-row">
        <div className="stat-card" style={{ background: "linear-gradient(135deg, #1A3A4A 0%, #0C4A60 100%)", color: "#fff" }}>
          <div className="stat-lbl" style={{ color: "#A8CDD8" }}>Revenue (window)</div>
          <div className="stat-val" style={{ color: "#fff" }}>{fmtMoney(billing?.revenue, 2)}</div>
          <div className="stat-delta" style={{
            color: deltaPct == null ? "#A8CDD8" : (deltaIsPositive ? "#86EFAC" : "#FCA5A5"),
            fontWeight: 600,
          }}>
            {deltaPct == null
              ? `${billing?.paid_count ?? 0} paid invoices`
              : `${deltaIsPositive ? "▲" : "▼"} ${Math.abs(deltaPct)}% vs prior period`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding</div>
          <div className="stat-val">{fmtMoney(billing?.outstanding)}</div>
          <div className="stat-delta neu">{billing?.open_count ?? 0} open invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">MRR estimate</div>
          <div className="stat-val">{fmtMoney(billing?.mrr_estimate)}</div>
          <div className="stat-delta neu">{billing?.upcoming_subscriptions?.length ?? 0} active subs</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Customer savings</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(billing?.coupon_impact?.total_discounted)}</div>
          <div className="stat-delta neu">{billing?.coupon_impact?.redemption_count ?? 0} coupon redemptions</div>
        </div>
      </div>

      {/* ── Revenue trend (big chart) ───────────────────────────────────── */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Revenue trend</div>
            <div className="card-sub">Paid invoices over the selected range</div>
          </div>
          {deltaPct != null && (
            <span style={{
              padding: "4px 10px", borderRadius: 99, fontSize: 12, fontWeight: 700,
              background: deltaIsPositive ? "#D1FAE5" : "#FEE2E2",
              color: deltaIsPositive ? "#047857" : "#991B1B",
            }}>
              {deltaIsPositive ? "+" : ""}{deltaPct}% MoM
            </span>
          )}
        </div>
        {trend.length === 0 ? (
          <div style={{ padding: "20px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
            No revenue in this range yet. Send your first invoice from the Invoices page.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1A7DB5" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#1A7DB5" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => fmtMoneyShort(v)} />
              <Tooltip formatter={(v) => fmtMoney(Number(v), 2)} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#1A7DB5" strokeWidth={3} fill="url(#revFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Two-column section ──────────────────────────────────────────── */}
      <div className="two-col">
        {/* Payment method donut */}
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Payment methods</div>
              <div className="card-sub">How your customers pay</div>
            </div>
          </div>
          {!billing?.payment_method_breakdown?.length || totalMethodAmount === 0 ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No payment data yet.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{ width: 160, height: 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={billing.payment_method_breakdown}
                      dataKey="amount"
                      nameKey="method"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                    >
                      {billing.payment_method_breakdown.map((_, i) => (
                        <Cell key={i} fill={METHOD_COLORS[i % METHOD_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(Number(v), 2)} contentStyle={{ borderRadius: 6, fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>
                {billing.payment_method_breakdown.map((m, i) => {
                  const pct = totalMethodAmount > 0 ? (Number(m.amount) / totalMethodAmount) * 100 : 0;
                  return (
                    <div key={m.method} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                      <span style={{
                        width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                        background: METHOD_COLORS[i % METHOD_COLORS.length],
                      }} />
                      <span style={{ flex: 1, color: "#0B1C24", fontWeight: 500 }}>{METHOD_LABELS[m.method] || m.method}</span>
                      <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>{pct.toFixed(0)}%</span>
                      <span style={{ color: "#0B1C24", fontFamily: "monospace", minWidth: 70, textAlign: "right" }}>{fmtMoney(m.amount, 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Top customers */}
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Top customers (window)</div>
              <div className="card-sub">Who's driving the most revenue right now</div>
            </div>
            <Link to="/app/services/oliver_contacts" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!billing?.top_customers?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No paid invoices in this range.
            </div>
          ) : (
            (() => {
              const max = Math.max(...billing.top_customers.map((c) => Number(c.total_paid)));
              return billing.top_customers.map((c) => (
                <div key={c.contact_id} className="hrow" style={{ display: "block", padding: "9px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 9 }}>
                    <Link to={`/app/services/oliver_contacts?focus=${c.contact_id}`}
                      style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#0B1C24", textDecoration: "none" }}>
                      {c.customer_name || "(no name)"}
                      <span style={{ color: "#5A7A8A", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                        · {c.payment_count} payment{c.payment_count === 1 ? "" : "s"}
                      </span>
                    </Link>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>{fmtMoney(c.total_paid, 0)}</span>
                  </div>
                  <div style={{ marginTop: 4, height: 4, background: "#F1F5F9", borderRadius: 99 }}>
                    <div style={{
                      width: `${max > 0 ? (Number(c.total_paid) / max) * 100 : 0}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: "linear-gradient(90deg, #1A7DB5 0%, #059669 100%)",
                    }} />
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </div>

      {/* ── Receivables ageing + Activity feed ──────────────────────────── */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Receivables ageing</div>
              <div className="card-sub">{fmtMoney(billing?.outstanding)} outstanding</div>
            </div>
            <Link to="/app/services/oliver_invoices" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>Manage →</Link>
          </div>
          {(billing?.outstanding ?? 0) === 0 ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
              No outstanding invoices. Nice.
            </div>
          ) : (
            <div style={{ marginTop: 6 }}>
              {/* Stacked bar visualization */}
              <div style={{ display: "flex", height: 32, borderRadius: 6, overflow: "hidden", border: "1px solid #E2E8F0" }}>
                {ageingBuckets.map((b) => {
                  const total = ageingBuckets.reduce((s, x) => s + x.amount, 0);
                  const w = total > 0 ? (b.amount / total) * 100 : 0;
                  if (w === 0) return null;
                  return (
                    <div key={b.label} style={{
                      width: `${w}%`, background: b.color,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700, color: "#fff",
                    }}>
                      {w > 18 && `${fmtMoneyShort(b.amount)}`}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 12 }}>
                {ageingBuckets.map((b) => (
                  <div key={b.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: b.color }} />
                    <span style={{ color: "#0B1C24", fontWeight: 500 }}>{b.label}</span>
                    <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>{fmtMoney(b.amount)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 11, color: "#5A7A8A", lineHeight: 1.5 }}>
                <strong style={{ color: "#0B1C24" }}>{billing?.draft_count ?? 0}</strong> draft invoice{billing?.draft_count === 1 ? "" : "s"} still need to be sent.
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Recent activity</div>
              <div className="card-sub">Last 10 payments + refunds</div>
            </div>
            <Link to="/app/services/oliver_payments" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!activity.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No activity in this range.
            </div>
          ) : (
            activity.slice(0, 10).map((p) => (
              <div key={p.payment_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className={`hdot ${p.type === "refund" ? "warn" : "ok"}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>
                    {p.customer_name || "—"}
                    {p.invoice_number && <span style={{ fontFamily: "monospace", color: "#5A7A8A", fontSize: 11 }}> · {p.invoice_number}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>
                    {p.type === "refund" ? "Refund · " : ""}{fmtRelative(p.paid_at)}
                  </div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.type === "refund" ? "#9333EA" : "#059669" }}>
                  {p.type === "refund" ? "−" : ""}{fmtMoney(p.amount, 2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Upcoming subscriptions + Quick actions ──────────────────────── */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Upcoming subscription renewals</div>
              <div className="card-sub">Next 30 days · {fmtMoney(billing?.mrr_estimate)}/mo current MRR</div>
            </div>
            <Link to="/app/services/oliver_recurring" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!billing?.upcoming_subscriptions?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No upcoming renewals.
            </div>
          ) : (
            billing.upcoming_subscriptions.slice(0, 8).map((s) => (
              <div key={s.subscription_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="hdot ok" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.service_name || "Subscription"}</div>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>Renews {fmtRelative(s.current_period_end)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(s.amount)}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-ttl">Quick actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <Link to="/app/services/oliver_invoices" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Send an invoice</Link>
            <Link to="/app/services/oliver_payments" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Record a payment</Link>
            <Link to="/app/services/oliver_coupons" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Create a coupon</Link>
            <Link to="/app/services/oliver_reminders" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Chase overdue</Link>
            <Link to="/app/services/oliver_recurring" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Subscriptions</Link>
            <Link to="/app/services/oliver_settings" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Stripe setup</Link>
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}
