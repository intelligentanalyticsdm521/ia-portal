import { Component, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
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
import { SetupHints, type SetupHint } from "../../components/SetupHints";
import { Sparkles, ArrowUpRight, Calendar as CalendarIcon, Users as UsersIcon, Globe, Zap, MessageSquare } from "lucide-react";
import { CalendarModal } from "../../components/oliver/customer/CalendarModal";
import { CustomerModal } from "../../components/oliver/customer/CustomerModal";

// ─── Inline error boundary ───────────────────────────────────────────────────
// Containment-only. A runtime exception in any new dashboard section should
// hide that section, not white-screen the whole page. Logs to console so a
// browser tab can still surface the underlying error during debugging.
class DashSectionBoundary extends Component<
  { label: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(err: Error, info: unknown) {
    // eslint-disable-next-line no-console
    console.error(`[OliverDashboard] ${this.props.label} crashed`, err, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{
          background: "#FEF3C7", border: "1px solid #FDE68A",
          color: "#78350F", fontSize: 12, padding: 12,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{this.props.label} unavailable</div>
          <div style={{ opacity: 0.85 }}>
            This section hit a runtime error and was hidden so the rest of the dashboard can render.
            Check the browser console for details.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  // Calendar Modal — opens from Weekly Glance widget + "Open full calendar"
  // link. Accepts an optional initialDate to deep-link the calendar to a
  // specific day when clicked from the Glance widget.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarInitialDate, setCalendarInitialDate] = useState<string | undefined>(undefined);
  // Job focus from Weekly Glance chip click — opens CustomerModal on that job
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const { get, post, patch, del, ready } = useOliverApi();
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

  // F-118 — dashboard setup hints. Lightweight, dismissable nudges that
  // complement the big setup card. Each hint is per-tenant, persistent (the
  // dismissal is localStorage-keyed by hint id), and only shows when the
  // data indicates the action hasn't been taken.
  const oliverHints: SetupHint[] = useMemo(() => ([
    {
      id: "oliver_no_workers",
      icon: UsersIcon,
      title: "Invite your crew",
      body: "You haven't added any workers yet. Workers see jobs in the crew portal and can be assigned via the job board.",
      cta: { label: "Add a worker", to: "/app/services/oliver_workers" },
      show: !!stats && (stats.workers ?? 0) === 0,
      accent: "#FEC82C",
    },
    {
      id: "oliver_portals_not_published",
      icon: Globe,
      title: "Publish your customer portal",
      body: "Your customer portal isn't live yet. Pick a subdomain or bring your own domain so customers can self-serve.",
      cta: { label: "Open portal hub", to: "/app/services/oliver_portals_hub" },
      show: !!onboarding && onboarding.all_required_complete === false,
      accent: "#1A3A4A",
    },
    {
      id: "oliver_no_automations",
      icon: Zap,
      title: "Turn on automations",
      body: "Booking confirmations, on-the-way SMS, auto-invoicing — automations run when you're not looking. Start with one.",
      cta: { label: "Open automations", to: "/app/services/oliver_automations" },
      show: true,
      accent: "#16A34A",
    },
    {
      id: "oliver_signup_form",
      icon: MessageSquare,
      title: "Customize your signup form",
      body: "Tell customers exactly what you need at signup — preferred contact, service address, key questions — instead of the defaults.",
      cta: { label: "Edit signup form", to: "/app/services/oliver_workflow_settings#signup-form" },
      show: true,
      accent: "#7C3AED",
    },
  ]), [stats, onboarding]);

  const topBanner: React.ReactNode = (
    <>
      <OliverSetupCard />
      <SetupHints hints={oliverHints} />
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

      {/* 1. IA Insights — compact header strip with Open Trends + Open ARGUS */}
      <DashSectionBoundary label="IA Insights">
        <OliverIAInsightsGlance trendScore={iaTrendScore} trendHistory={iaTrendHistory} />
      </DashSectionBoundary>

      {/* 2. Alerts — only when present (setup checklist + Stripe regression) */}
      {topBanner}

      {/* 3. Weekly Glance — primary daily operator surface */}
      <DashSectionBoundary label="Weekly Glance">
        <WeeklyGlance
          onOpenCalendar={(initialDate) => {
            setCalendarInitialDate(initialDate);
            setCalendarOpen(true);
          }}
          onOpenJob={(jobId) => setFocusJobId(jobId)}
        />
      </DashSectionBoundary>

      {/* 4. KPI row — secondary stats (smaller than headline area) */}
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

      {/* 5. "Today" narrative — sparkline + headline message, secondary placement */}
      {today && (
        <DashSectionBoundary label="Today narrative">
          <TodayHero today={today} />
        </DashSectionBoundary>
      )}

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

      {calendarOpen && (
        <CalendarModal
          initialDate={calendarInitialDate}
          onClose={() => { setCalendarOpen(false); setCalendarInitialDate(undefined); }}
        />
      )}

      {focusJobId && (
        <CustomerModal
          focusJobId={focusJobId}
          onClose={() => setFocusJobId(null)}
          api={{ get, post, patch, del }}
        />
      )}
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
  // Defensive: backend should always send a headline, but if not, fall back
  // to an "ok / quiet day" message instead of throwing on palette[undefined].tone.
  const headline = today.headline ?? {
    tone: "ok" as const,
    message: "Nothing urgent right now.",
    action: { label: "Open job board", to: "/app/services/oliver_job_board" },
  };
  const c = palette[headline.tone] ?? palette.ok;
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  })();
  // Defensive: sparkline may be missing/null on first deploy or on tenants
  // with no revenue history. Treat as empty array → renders the "no revenue"
  // empty state instead of crashing on .map of undefined.
  const sparkline = Array.isArray(today.sparkline) ? today.sparkline : [];
  const max = Math.max(...sparkline.map((s) => s.revenue), 0);

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
            {headline.message}
          </div>
        </div>
        <Link
          to={headline.action?.to || "/app/services/oliver_job_board"}
          style={{
            padding: "8px 16px", borderRadius: 8, background: c.text, color: "#fff",
            fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >
          {headline.action?.label || "Open"} →
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
                <AreaChart data={sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
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
  // Founder spec 2026-05-26: compact header strip — no big colored band,
  // score + sparkline + nav buttons all on one row.
  const scoreColor = trendScore == null
    ? "#94A3B8"
    : trendScore >= 70 ? "#16A34A"
    : trendScore >= 50 ? "#EAB308"
    : "#DC2626";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      background: "#fff", border: "1px solid #E5E7EB", borderRadius: 10,
      padding: "10px 14px", margin: "12px 0",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Sparkles className="h-4 w-4" style={{ color: "#FEC82C", flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: "#0F172A" }}>IA Insights</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.4, color: "#64748B", fontWeight: 600 }}>
          Trend Score
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: scoreColor, fontVariantNumeric: "tabular-nums" }}>
          {trendScore != null ? trendScore : "—"}
        </span>
        {trendHistory.length > 1 && (
          <Sparkline data={trendHistory} color={scoreColor} width={80} height={22} showBands={false} />
        )}
      </div>
      <div style={{ flex: 1, fontSize: 11, color: "#64748B", minWidth: 200 }}>
        {trendScore != null
          ? "Composite across Ops Health, Revenue, Cash Flow, Win Rate, Retention, Capacity, Service Line, Seasonal."
          : "Reports populate after 30 days of jobs/invoices/payments."}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Link to="/app/services/oliver_ia_insights_trends" style={{
          fontSize: 11, color: "#0C4A60", textDecoration: "none",
          padding: "5px 10px", border: "1px solid #cbd5e1", borderRadius: 6,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          Open Trends <ArrowUpRight className="h-3 w-3" />
        </Link>
        <Link to="/app/services/argus_health" style={{
          fontSize: 11, color: "#0C4A60", textDecoration: "none",
          padding: "5px 10px", border: "1px solid #cbd5e1", borderRadius: 6,
          display: "inline-flex", alignItems: "center", gap: 3,
        }}>
          Open ARGUS <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WeeklyGlance — 7-day strip showing next week's job load at-a-glance.
// Founder spec 2026-05-26 — the dashboard's primary calendar surface.
// Click a day to drill into that date via the CalendarModal; click a job
// chip to open it directly.
// ─────────────────────────────────────────────────────────────────────────────
interface WeeklyGlanceEvent {
  id: string;
  type?: "job" | "booking";
  title: string;
  /** date is an alias of scheduled_start sent by the backend. */
  date?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  status: string;
  customer_name?: string | null;
  worker_id?: string | null;
  worker_name?: string | null;
}

function WeeklyGlance({
  onOpenCalendar,
  onOpenJob,
}: {
  onOpenCalendar: (initialDate?: string) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const { get, ready } = useOliverApi();
  const [events, setEvents] = useState<WeeklyGlanceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // 7-day window starting today
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [today]);
  const startStr = today.toISOString().slice(0, 10);
  const endStr = days[6].toISOString().slice(0, 10);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await get<WeeklyGlanceEvent[]>(`/schedule/calendar?start=${startStr}&end=${endStr}`);
        if (!cancelled) setEvents(data || []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [get, ready, startStr, endStr]);

  // Backend returns one row per (job, worker_assignment) — a job assigned to 3
  // workers arrives as 3 rows with the same id. Dedupe by id for chip display
  // (counts + chips per day should reflect unique jobs/bookings, not rows).
  const dedupedEvents = useMemo(() => {
    const seen = new Set<string>();
    const out: WeeklyGlanceEvent[] = [];
    for (const ev of events) {
      if (!ev?.id || seen.has(ev.id)) continue;
      seen.add(ev.id);
      out.push(ev);
    }
    return out;
  }, [events]);

  // Build a YYYY-MM-DD key from an event using the user's local timezone so
  // a 9am-local job lands on today's column even if the API returns a UTC
  // timestamp. Using toISOString() here would shift it to the wrong day.
  function eventLocalDayKey(ev: WeeklyGlanceEvent): string | null {
    const raw = ev.scheduled_start || ev.date;
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const d = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // Same conversion for the day columns themselves so keys are comparable.
  function localDayKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const eventsByDay = useMemo(() => {
    const map = new Map<string, WeeklyGlanceEvent[]>();
    for (const ev of dedupedEvents) {
      const key = eventLocalDayKey(ev);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    // Sort each day's events by start time so the displayed chips are
    // chronological (matches the user's mental model of "what's first today").
    for (const list of map.values()) {
      list.sort((a, b) => {
        const ta = new Date(a.scheduled_start || a.date || 0).getTime();
        const tb = new Date(b.scheduled_start || b.date || 0).getTime();
        return ta - tb;
      });
    }
    return map;
  }, [dedupedEvents]);

  const todayKey = localDayKey(today);

  return (
    <div className="card">
      <div className="card-hdr">
        <div>
          <div className="card-ttl">Weekly Glance</div>
          <div className="card-sub">{dedupedEvents.length} job{dedupedEvents.length === 1 ? "" : "s"} scheduled in the next 7 days · click a day or job to drill in</div>
        </div>
        <button
          onClick={() => onOpenCalendar()}
          style={{
            background: "none", border: "none", padding: 0, cursor: "pointer",
            fontSize: 11, color: "#1A7DB5",
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <CalendarIcon className="h-3 w-3" /> Open full calendar →
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {days.map((d) => {
          const key = localDayKey(d);
          const dayEvents = eventsByDay.get(key) || [];
          const isToday = key === todayKey;
          const dow = d.toLocaleDateString("en-US", { weekday: "short" });
          const dom = d.getDate();
          return (
            <button
              key={key}
              type="button"
              onClick={() => onOpenCalendar(key)}
              style={{
                display: "flex", flexDirection: "column", gap: 4,
                background: isToday ? "#E8F4FB" : "#fff",
                border: `1px solid ${isToday ? "#1A7DB5" : "#E5E7EB"}`,
                borderRadius: 8, padding: "8px 6px",
                cursor: "pointer", textAlign: "left",
                minHeight: 110,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{
                  fontSize: 10, color: isToday ? "#1A7DB5" : "#5A7A8A",
                  textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 700,
                }}>
                  {dow}
                </span>
                <span style={{
                  fontSize: 14, fontWeight: 700,
                  color: isToday ? "#1A7DB5" : "#0B1C24",
                }}>
                  {dom}
                </span>
              </div>
              {loading ? (
                <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>—</span>
              ) : dayEvents.length === 0 ? (
                <span style={{ fontSize: 10, color: "#94A3B8" }}>No jobs</span>
              ) : (
                <>
                  <span style={{ fontSize: 10, color: "#5A7A8A", fontWeight: 600 }}>
                    {dayEvents.length} job{dayEvents.length === 1 ? "" : "s"}
                  </span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayEvents.slice(0, 3).map((ev) => {
                      const c = ev.type === "booking"
                        ? { bg: "#F3E8FF", fg: "#7E22CE" } // bookings: purple
                        : weeklyGlanceStatusColor(ev.status);
                      const t = ev.scheduled_start
                        ? new Date(ev.scheduled_start).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
                        : "";
                      const tip = [
                        t,
                        ev.title || "(untitled)",
                        ev.customer_name ? `· ${ev.customer_name}` : "",
                        ev.worker_name ? `· ${ev.worker_name}` : "",
                        ev.type === "booking" ? "· booking" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <span
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            // Bookings aren't jobs yet — clicking should drill into
                            // the day so the user can convert/inspect it from there.
                            if (ev.type === "booking") onOpenCalendar(key);
                            else onOpenJob(ev.id);
                          }}
                          style={{
                            background: c.bg, color: c.fg,
                            padding: "1px 4px", borderRadius: 3,
                            fontSize: 9, fontWeight: 500,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                          title={tip}
                        >
                          {t ? `${t} · ` : ""}{ev.title || "(untitled)"}
                        </span>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span style={{ fontSize: 9, color: "#94A3B8" }}>+ {dayEvents.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function weeklyGlanceStatusColor(status: string): { bg: string; fg: string } {
  switch (status) {
    case "scheduled":   return { bg: "#DBEAFE", fg: "#1E40AF" };
    case "assigned":
    case "dispatched":  return { bg: "#CFFAFE", fg: "#0E7490" };
    case "in_progress": return { bg: "#FEF3C7", fg: "#B45309" };
    case "completed":   return { bg: "#D1FAE5", fg: "#047857" };
    case "invoiced":    return { bg: "#DBEAFE", fg: "#1E40AF" };
    case "paid":        return { bg: "#D1FAE5", fg: "#047857" };
    case "cancelled":   return { bg: "#FEE2E2", fg: "#B91C1C" };
    default:            return { bg: "#F1F5F9", fg: "#475569" };
  }
}
