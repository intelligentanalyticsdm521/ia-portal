import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader,
  TimeRangeSelector,
  rangeForPreset,
  type TimeRange,
} from "../../components/oliver/ui";

interface BillingOverview {
  revenue: number;
  outstanding: number;
  overdue: number;
  paid_count: number;
  open_count: number;
  overdue_count: number;
  draft_count: number;
  upcoming_subscriptions: Array<{ subscription_id: string; service_name: string; amount: number; current_period_end: string; status: string; billing_interval?: string }>;
  recent_payments: Array<{ payment_id: string; amount: number; type: string; paid_at: string; invoice_number?: string; customer_name?: string }>;
}

interface BillingTrendBucket { month: string; revenue: number; paid_count: number; }

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtRelative(d?: string) {
  if (!d) return "—";
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 0) {
    const future = Math.abs(days);
    if (future === 0) return "today";
    if (future === 1) return "tomorrow";
    return `in ${future} days`;
  }
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
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

export function OliverBillingOverviewPage() {
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

  // Estimated MRR: sum of active monthly subs (we approximate from amounts).
  const mrr = (billing?.upcoming_subscriptions || []).reduce((s, sub) => {
    if (sub.billing_interval === "year") return s + Number(sub.amount || 0) / 12;
    if (sub.billing_interval === "week") return s + Number(sub.amount || 0) * 4.33;
    return s + Number(sub.amount || 0);
  }, 0);

  return (
    <OliverPageWrapper title="Billing Overview" subtitle="Stripe-style billing dashboard" error={error} loading={loading}>
      <PageHeader
        title="Billing Overview"
        subtitle="Revenue, outstanding receivables, subscriptions, and recent activity"
        actions={<TimeRangeSelector value={range} onChange={setRange} />}
      />

      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Gross volume</div>
          <div className="stat-val">{fmtMoney(billing?.revenue)}</div>
          <div className="stat-delta neu">{billing?.paid_count ?? 0} paid invoices</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Outstanding</div>
          <div className="stat-val">{fmtMoney(billing?.outstanding)}</div>
          <div className="stat-delta neu">{billing?.open_count ?? 0} open</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Overdue</div>
          <div className="stat-val" style={{ color: (billing?.overdue ?? 0) > 0 ? "#D97706" : undefined }}>
            {fmtMoney(billing?.overdue)}
          </div>
          <div className="stat-delta neu">{billing?.overdue_count ?? 0} past due</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Estimated MRR</div>
          <div className="stat-val">{fmtMoney(mrr)}</div>
          <div className="stat-delta neu">{billing?.upcoming_subscriptions?.length ?? 0} active subs</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Revenue trend</div>
            <div className="card-sub">Paid invoices over the selected range</div>
          </div>
        </div>
        {trend.length === 0 ? (
          <div style={{ padding: "20px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic", textAlign: "center" }}>
            No revenue in this range yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => fmtMoney(Number(v))} />
              <Line type="monotone" dataKey="revenue" stroke="#1A7DB5" strokeWidth={3} dot={{ fill: "#0C4A60", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Recent payments</div>
              <div className="card-sub">Last 10 successful payments</div>
            </div>
            <Link to="/app/services/oliver_payments" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!billing?.recent_payments?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No payments in this range.
            </div>
          ) : (
            billing.recent_payments.slice(0, 10).map((p) => (
              <div key={p.payment_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className={`hdot ${p.type === "refund" ? "warn" : "ok"}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>
                    {p.customer_name || "—"}
                    {p.invoice_number && <span style={{ fontFamily: "monospace", color: "#5A7A8A", fontSize: 11 }}> · {p.invoice_number}</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{fmtRelative(p.paid_at)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: p.type === "refund" ? "#9333EA" : "#059669" }}>
                  {p.type === "refund" ? "−" : ""}{fmtMoney(p.amount)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Upcoming subscription renewals</div>
              <div className="card-sub">Next 30 days</div>
            </div>
            <Link to="/app/services/oliver_recurring" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!billing?.upcoming_subscriptions?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No upcoming renewals.
            </div>
          ) : (
            billing.upcoming_subscriptions.slice(0, 10).map((s) => (
              <div key={s.subscription_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="hdot ok" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.service_name || "Subscription"}</div>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{fmtRelative(s.current_period_end)}</div>
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{fmtMoney(s.amount)}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-ttl">Receivables breakdown</div>
          <div style={{ padding: "8px 0", fontSize: 12 }}>
            <Row label="Sent (open)" value={`${billing?.open_count ?? 0} · ${fmtMoney(billing?.outstanding)}`} />
            <Row label="Past due" value={<span style={{ color: (billing?.overdue ?? 0) > 0 ? "#D97706" : undefined }}>
              {`${billing?.overdue_count ?? 0} · ${fmtMoney(billing?.overdue)}`}
            </span>} />
            <Row label="Drafts" value={`${billing?.draft_count ?? 0}`} />
          </div>
        </div>

        <div className="card">
          <div className="card-ttl">Quick actions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <Link to="/app/services/oliver_invoices" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Manage invoices</Link>
            <Link to="/app/services/oliver_recurring" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Manage subscriptions</Link>
            <Link to="/app/services/oliver_catalog" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Service catalog</Link>
            <Link to="/app/services/oliver_settings" className="abtn abtn-secondary" style={{ textAlign: "center", textDecoration: "none" }}>Stripe Connect setup</Link>
          </div>
        </div>
      </div>
    </OliverPageWrapper>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "5px 0" }}>
      <span style={{ color: "#5A7A8A" }}>{label}</span>
      <span style={{ color: "#0B1C24", fontWeight: 500 }}>{value}</span>
    </div>
  );
}
