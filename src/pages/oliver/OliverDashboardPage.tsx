import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button, StatusBadge } from "../../components/oliver/ui";

interface DashboardStats {
  activeJobs: number;
  revenue: number;
  openInvoices: number;
  workers: number;
}
interface ActivityEvent {
  id: string;
  description: string;
  type: string;
  created_at: string;
}
interface BillingOverview {
  revenue: number;
  outstanding: number;
  overdue: number;
  paid_count: number;
  open_count: number;
  overdue_count: number;
  draft_count: number;
  upcoming_subscriptions: Array<{ subscription_id: string; service_name: string; amount: number; current_period_end: string; status: string }>;
  recent_payments: Array<{ payment_id: string; amount: number; type: string; paid_at: string; invoice_number?: string; customer_name?: string }>;
}
interface OpsOverview {
  upcoming_jobs: Array<{ job_id: string; job_number: string; title: string; status: string; scheduled_start: string; customer_name?: string; assigned_to?: string }>;
  open_requests: Array<{ job_id: string; job_number: string; title: string; created_at: string; customer_notes?: string; customer_name?: string }>;
}
interface StripeStatus {
  connected: boolean;
  readyToCharge?: boolean;
  detailsSubmitted?: boolean;
  chargesEnabled?: boolean;
}
interface ArrearsCustomer {
  contact_id: string;
  customer_name: string;
  company_name?: string;
  email?: string;
  outstanding: number;
  overdue: number;
  open_count: number;
  overdue_count: number;
  max_days_late?: number;
}

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

export function OliverDashboardPage() {
  const { get, ready } = useOliverApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [ops, setOps] = useState<OpsOverview | null>(null);
  const [arrears, setArrears] = useState<ArrearsCustomer[]>([]);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [s, a, b, o, ar, st] = await Promise.all([
          get<DashboardStats>("/dashboard/stats"),
          get<ActivityEvent[]>("/dashboard/activity"),
          get<BillingOverview>("/overview/billing"),
          get<OpsOverview>("/overview/operations"),
          get<ArrearsCustomer[]>("/overview/arrears?limit=5").catch(() => [] as ArrearsCustomer[]),
          get<StripeStatus>("/settings/stripe").catch(() => null),
        ]);
        setStats(s); setActivity(a || []); setBilling(b); setOps(o); setArrears(ar || []); setStripeStatus(st);
      } catch (e) { setError(e); }
      finally { setLoading(false); }
    })();
  }, [get, ready]);

  // Show onboarding banner when Stripe is not connected, or connected but not ready to charge.
  const stripeBanner = stripeStatus && !stripeStatus.readyToCharge ? (
    <div className="card" style={{
      background: "linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)",
      border: "1px solid #F59E0B",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#92400E", marginBottom: 4 }}>
            {stripeStatus.connected ? "Finish your Stripe setup to start collecting payments" : "Connect Stripe to start collecting payments"}
          </div>
          <div style={{ fontSize: 12, color: "#78350F", lineHeight: 1.5 }}>
            {stripeStatus.connected
              ? "Your Stripe account exists but isn't ready to accept charges yet. Finish onboarding (bank account, ID verification) to start sending invoices and accepting payments."
              : "OLIVER routes every invoice and payment through Stripe Connect — money flows directly to your bank, not to us. Setup takes about 5 minutes."}
          </div>
        </div>
        <Link to="/app/services/oliver_settings" style={{ flexShrink: 0 }}>
          <Button variant="primary">
            {stripeStatus.connected ? "Finish setup" : "Connect Stripe"}
          </Button>
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <OliverPageWrapper title="Dashboard" subtitle="Overview" error={error} loading={loading}>
      <PageHeader
        title="Dashboard"
        subtitle="Everything happening in your business right now"
        actions={
          <>
            <Link to="/app/services/oliver_invoices"><Button variant="secondary">Invoices</Button></Link>
            <Link to="/app/services/oliver_job_board"><Button variant="primary">Open job board</Button></Link>
          </>
        }
      />

      {stripeBanner}

      {/* KPI row — ARION stat-card pattern */}
      <div className="stat-row">
        <div className="stat-card">
          <div className="stat-lbl">Active jobs</div>
          <div className="stat-val">{stats?.activeJobs ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Revenue (paid)</div>
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
      </div>

      {/* Two-col layout: upcoming jobs + service requests */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Upcoming jobs</div>
              <div className="card-sub">Scheduled, assigned, or dispatched — next 14 days</div>
            </div>
            <Link to="/app/services/oliver_schedule" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View schedule →</Link>
          </div>
          {!ops?.upcoming_jobs?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No upcoming jobs. New requests appear here when scheduled.
            </div>
          ) : (
            ops.upcoming_jobs.slice(0, 8).map((j) => (
              <div key={j.job_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <StatusBadge status={j.status} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>
                    {j.title || "(untitled)"} · {j.customer_name || "—"}
                  </div>
                  <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>
                    {fmtRelative(j.scheduled_start)} {j.assigned_to && `· ${j.assigned_to}`}
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{j.job_number}</div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">New service requests</div>
              <div className="card-sub">Awaiting review from the customer portal</div>
            </div>
            <Link to="/app/services/oliver_service_requests" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
          </div>
          {!ops?.open_requests?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No open requests right now.
            </div>
          ) : (
            ops.open_requests.slice(0, 5).map((r) => (
              <div key={r.job_id} className="hrow" style={{ display: "block", padding: "9px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.title || "Service request"}</span>
                  <span style={{ fontSize: 10, color: "#5A7A8A" }}>{fmtRelative(r.created_at)}</span>
                </div>
                <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{r.customer_name}</div>
                {r.customer_notes && (
                  <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4, lineHeight: 1.4, fontStyle: "italic" }}>
                    "{r.customer_notes.slice(0, 120)}{r.customer_notes.length > 120 ? "…" : ""}"
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Two-col: customers in arrears + recent payments */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Customers in arrears</div>
              <div className="card-sub">Highest outstanding balances, overdue first</div>
            </div>
            <Link to="/app/services/oliver_reminders" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View reminders →</Link>
          </div>
          {!arrears.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              All customers are paid up — nothing outstanding.
            </div>
          ) : (
            arrears.slice(0, 5).map((a) => (
              <Link
                key={a.contact_id}
                to="/app/services/oliver_contacts"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span className={`hdot ${a.overdue > 0 ? "warn" : "neu"}`} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>
                      {a.company_name || a.customer_name}
                      {a.overdue_count > 0 && (
                        <span style={{
                          display: "inline-block", marginLeft: 8, fontSize: 9, fontWeight: 600,
                          padding: "1px 6px", borderRadius: 999, background: "#FEE2E2", color: "#991B1B",
                        }}>
                          {a.overdue_count} overdue
                          {a.max_days_late ? ` · ${a.max_days_late}d late` : ""}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{a.open_count} open invoice{a.open_count === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: a.overdue > 0 ? "#DC2626" : "#0B1C24" }}>
                      {fmtMoney(a.outstanding)}
                    </div>
                    {a.overdue > 0 && (
                      <div style={{ fontSize: 10, color: "#DC2626" }}>{fmtMoney(a.overdue)} overdue</div>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>

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
              No payments yet.
            </div>
          ) : (
            billing.recent_payments.slice(0, 8).map((p) => (
              <div key={p.payment_id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className={`hdot ${p.type === "refund" ? "warn" : "ok"}`} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>
                    {p.customer_name || "—"} {p.invoice_number && <span style={{ fontFamily: "monospace", color: "#5A7A8A", fontSize: 11 }}>· {p.invoice_number}</span>}
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
      </div>

      {/* Upcoming subscriptions (full width) */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Upcoming subscriptions</div>
            <div className="card-sub">Renewals in next 30 days</div>
          </div>
          <Link to="/app/services/oliver_recurring" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
        </div>
          {!billing?.upcoming_subscriptions?.length ? (
            <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
              No upcoming subscription renewals.
            </div>
          ) : (
            billing.upcoming_subscriptions.slice(0, 8).map((s) => (
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

      {/* Recent activity stream */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Recent activity</div>
            <div className="card-sub">Status changes, transitions, system events</div>
          </div>
          <Link to="/app/services/oliver_activity_log" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>View all →</Link>
        </div>
        {!activity.length ? (
          <div style={{ padding: "16px 0", color: "#5A7A8A", fontSize: 12, fontStyle: "italic" }}>
            No activity yet.
          </div>
        ) : (
          activity.slice(0, 10).map((e) => (
            <div key={e.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <StatusBadge status={e.type || "info"} />
              <div style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>{e.description}</div>
              <div style={{ fontSize: 10, color: "#5A7A8A" }}>{fmtRelative(e.created_at)}</div>
            </div>
          ))
        )}
      </div>
    </OliverPageWrapper>
  );
}
