import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, AreaChart, Area, Tooltip,
} from "recharts";
import { useOliverApi } from "../../hooks/useOliverApi";
import { useSparkApi } from "../../hooks/useSparkApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { PageHeader, Button, StatusBadge } from "../../components/oliver/ui";
import { Sparkline } from "../../components/iainsights/Sparkline";
import { OliverSetupCard } from "../../components/command/OliverSetupCard";
import { Sparkles, ArrowUpRight, Calendar as CalendarIcon } from "lucide-react";
import { CalendarModal } from "../../components/oliver/customer/CalendarModal";

interface TodaySummary {
  jobs_today: number;
  jobs_done_today: number;
  revenue_today: number;
  revenue_this_week: number;
  revenue_last_week: number;
  revenue_wow_pct: number | null;
  open_requests: number;
  overdue_invoices: number;
  overdue_amount: number;
  disputes_open: number;
  sparkline: Array<{ day: string; revenue: number }>;
  headline: {
    tone: "alert" | "warn" | "info" | "ok";
    message: string;
    action: { label: string; to: string };
  };
}

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
interface OnboardingStatus {
  onboarding_completed_at: string | null;
  all_required_complete: boolean;
  completed_count: number;
  total_steps: number;
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
  // Calendar Modal — opens from the "Upcoming jobs" card. Replaces the
  // standalone Schedule page that was removed from the nav in Phase 1A.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { get, ready } = useOliverApi();
  const spark = useSparkApi();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [billing, setBilling] = useState<BillingOverview | null>(null);
  const [ops, setOps] = useState<OpsOverview | null>(null);
  const [arrears, setArrears] = useState<ArrearsCustomer[]>([]);
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [today, setToday] = useState<TodaySummary | null>(null);
  const [iaTrendScore, setIaTrendScore] = useState<number | null>(null);
  const [iaTrendHistory, setIaTrendHistory] = useState<Array<{ period_end: string; score: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  // v6.8 — Pull OLIVER IA Insights summary from LUMEN-API (presence score + 12-period history)
  useEffect(() => {
    if (!spark.ready) return;
    let cancelled = false;
    (async () => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const ps = await spark.get<{ data: Record<string, { score: number; periodEnd: string }> }>(
          `/api/v1/ia-insights/prior-scores?product=oliver&beforeDate=${today}`
        ).catch(() => null);
        const hist = await spark.get<{ data: Array<{ period_end: string; score: number }> }>(
          `/api/v1/ia-insights/score-history?product=oliver&reportKey=presence&limit=12`
        ).catch(() => null);
        if (cancelled) return;
        setIaTrendScore(ps?.data?.presence?.score ?? null);
        setIaTrendHistory((hist?.data || []).filter((r) => r && r.period_end));
      } catch { /* swallow */ }
    })();
    return () => { cancelled = true; };
  }, [spark]);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const [s, a, b, o, ar, st, ob, t] = await Promise.all([
          get<DashboardStats>("/dashboard/stats"),
          get<ActivityEvent[]>("/dashboard/activity"),
          get<BillingOverview>("/overview/billing"),
          get<OpsOverview>("/overview/operations"),
          get<ArrearsCustomer[]>("/overview/arrears?limit=5").catch(() => [] as ArrearsCustomer[]),
          get<StripeStatus>("/settings/stripe").catch(() => null),
          get<OnboardingStatus>("/onboarding/status").catch(() => null),
          get<TodaySummary>("/dashboard/today").catch(() => null),
        ]);
        setStats(s); setActivity(a || []); setBilling(b); setOps(o); setArrears(ar || []); setStripeStatus(st); setOnboarding(ob); setToday(t);
      } catch (e) { setError(e); }
      finally { setLoading(false); }
    })();
  }, [get, ready]);

  // Prefer the guided onboarding banner when wizard hasn't been completed.
  // Falls back to the original Stripe-only banner if /onboarding/status fails.
  // Always render the inline setup card — it self-decides visibility
  // (fail-open: shows whenever onboarding is outstanding, hides only when
  // genuinely 100% complete). Plus a Stripe-only nag for the edge case where
  // onboarding completed but the Stripe account later regressed.
  const stripeRegressed = !!onboarding?.all_required_complete && !!stripeStatus && !stripeStatus.readyToCharge;
  const topBanner: React.ReactNode = (
    <>
      <OliverSetupCard />
      {stripeRegressed && (
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
      )}
    </>
  );

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

      {topBanner}

      {/* v6.8 — IA Insights at-a-glance strip (links to Trends + ARGUS) */}
      <OliverIAInsightsGlance trendScore={iaTrendScore} trendHistory={iaTrendHistory} />

      {/* Hero "Today" narrative + sparkline — ARION-style headline card */}
      {today && (
        <TodayHero today={today} />
      )}

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
            <button
              onClick={() => setCalendarOpen(true)}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 11, color: "#1A7DB5", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <CalendarIcon className="h-3 w-3" /> Open calendar
            </button>
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

      {calendarOpen && <CalendarModal onClose={() => setCalendarOpen(false)} />}
    </OliverPageWrapper>
  );
}

// ─── Today's hero card ─────────────────────────────────────────────────────
// Narrative + headline + 7-day sparkline. Replaces the old "row of numbers"
// landing experience with a glanceable summary plus a one-sentence "what
// needs attention right now".
function TodayHero({ today }: { today: TodaySummary }) {
  const palette: Record<TodaySummary["headline"]["tone"], { bg: string; border: string; text: string; icon: string }> = {
    alert: { bg: "linear-gradient(90deg, #FEE2E2 0%, #FECACA 100%)", border: "#FCA5A5", text: "#991B1B", icon: "!" },
    warn:  { bg: "linear-gradient(90deg, #FEF3C7 0%, #FEF9C3 100%)", border: "#FDE68A", text: "#92400E", icon: "!" },
    info:  { bg: "linear-gradient(90deg, #DBEAFE 0%, #BFDBFE 100%)", border: "#93C5FD", text: "#1E40AF", icon: "i" },
    ok:    { bg: "linear-gradient(90deg, #D1FAE5 0%, #A7F3D0 100%)", border: "#6EE7B7", text: "#065F46", icon: "✓" },
  };
  const c = palette[today.headline.tone];
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();
  const max = Math.max(...today.sparkline.map((s) => s.revenue), 0);

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* Headline narrative banner */}
      <div style={{
        padding: 16, background: c.bg, borderBottom: `1px solid ${c.border}`,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%",
          background: c.text, color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{c.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: c.text, opacity: 0.75, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {greeting}
          </div>
          <div style={{ fontSize: 14, color: c.text, fontWeight: 600, lineHeight: 1.4, marginTop: 2 }}>
            {today.headline.message}
          </div>
        </div>
        <Link
          to={today.headline.action.to}
          style={{
            padding: "8px 16px", borderRadius: 8, background: c.text, color: "#fff",
            fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {today.headline.action.label} →
        </Link>
      </div>

      {/* Stat strip: today's jobs + revenue + sparkline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 0 }}>
        <div style={{ padding: 16, borderRight: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Today's schedule
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#1A3A4A", fontFamily: "monospace" }}>{today.jobs_today}</span>
            {today.jobs_today > 0 && (
              <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>
                · {today.jobs_done_today} done
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}>
            job{today.jobs_today === 1 ? "" : "s"} scheduled
          </div>
        </div>

        <div style={{ padding: 16, borderRight: "1px solid #E5E7EB" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Collected today
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: "#059669", fontFamily: "monospace" }}>
              ${Number(today.revenue_today).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
          </div>
          {today.revenue_wow_pct != null ? (
            <div style={{ fontSize: 11, marginTop: 4, fontWeight: 600,
                          color: today.revenue_wow_pct >= 0 ? "#059669" : "#B91C1C" }}>
              {today.revenue_wow_pct >= 0 ? "▲" : "▼"} {Math.abs(today.revenue_wow_pct)}% WoW
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}>this week</div>
          )}
        </div>

        <div style={{ padding: 16, position: "relative" }}>
          <div style={{ fontSize: 11, color: "#5A7A8A", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Last 7 days revenue
          </div>
          {max > 0 ? (
            <div style={{ height: 70, marginTop: 4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={today.sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashSpark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1A7DB5" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#1A7DB5" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    formatter={(v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    labelFormatter={(label) => new Date(label).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                    contentStyle={{ borderRadius: 6, fontSize: 11, padding: 6 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#1A7DB5" strokeWidth={2} fill="url(#dashSpark)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div style={{ height: 70, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>
              No revenue in the last 7 days
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─ OLIVER IA Insights at-a-glance (v6.8) ───────────────────────────────────
function OliverIAInsightsGlance({
  trendScore,
  trendHistory,
}: {
  trendScore: number | null;
  trendHistory: Array<{ period_end: string; score: number }>;
}) {
  const score = trendScore ?? 0;
  const band = score >= 70 ? "green" : score >= 50 ? "amber" : score > 0 ? "red" : "gray";
  const bandColor = ({ green: "#16A34A", amber: "#EAB308", red: "#DC2626", gray: "#94A3B8" } as const)[band];
  return (
    <div
      style={{
        background: "linear-gradient(90deg, rgba(254,200,44,0.15), #ffffff)",
        border: "1px solid #E5E7EB",
        borderRadius: 12,
        padding: 14,
        margin: "16px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles className="h-4 w-4" style={{ color: "#FEC82C" }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>OLIVER IA Insights at a glance</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link to="/app/services/oliver_ia_insights_trends" style={{ fontSize: 12, color: "#1A3A4A", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
            Open Trends <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link to="/app/services/argus_health" style={{ fontSize: 12, color: "#64748B", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 2 }}>
            ARGUS <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 8, padding: "10px 14px", flex: 1, maxWidth: 280 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: "#64748B", fontWeight: 600, marginBottom: 2 }}>
            OLIVER Trend Score
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: bandColor }}>
              {trendScore != null ? trendScore : "—"}
            </div>
            {trendHistory.length > 1 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <Sparkline data={trendHistory} color={bandColor} width={100} height={26} showBands={false} />
              </div>
            )}
          </div>
          <div style={{ fontSize: 9, color: "#94A3B8", marginTop: 2 }}>
            {trendScore != null ? `Band: ${band}` : "Reports populate after 30 days of jobs/invoices/payments"}
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#475569", flex: 1 }}>
          Composite across Operations Health, Revenue Performance, Cash Flow, Quote Win Rate,
          Customer Retention, Crew Capacity, Service Line, and Seasonal Planning.
          See the 8-report breakdown for specific observations and recommended actions.
        </div>
      </div>
    </div>
  );
}
