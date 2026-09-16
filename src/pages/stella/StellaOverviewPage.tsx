// StellaOverviewPage — Ledger → Overview (the STELLA landing page).
//
// Founder-approved design: the entry-level-QuickBooks-replacement look — a
// glanceable "how is the business doing" page, not a data-entry grid. Pattern
// follows OliverDashboardPage: hero headline card (tone + one action) →
// KPI row → charts → detail cards. One fetch: GET /ledger/overview?month=.
// Degrades gracefully while the backend lands: a 404 renders an honest
// "service not live yet" card, never a broken page and never fake numbers.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { CreditCard, Landmark, RefreshCw } from "lucide-react";
import { useStellaApi } from "../../hooks/useStellaApi";
import { StellaShell, STELLA_INDIGO, STELLA_LAVENDER, fmtMoney } from "./StellaShell";

// GET /ledger/overview?month=YYYY-MM (stella-api; { data } envelope unwrapped
// by stellaApi). accounts/upcomingRecurring stay [] until Plaid / ingestion.
interface LedgerOverview {
  month: string;
  income: number;
  expenses: number;
  net: number;
  owedToYou: number;
  inboxCount: number;
  expensesByAccount: Array<{ account: string; amount: number }>;
  cashflow: Array<{ weekStart: string; inflow: number; outflow: number }>;
  upcomingRecurring: Array<{
    recurring_id?: string;
    template_id?: string;
    name?: string | null;
    counterparty_name?: string | null;
    cadence?: string | null;
    amount?: number | string | null;
    next_date?: string | null;
  }>;
  // Shape matches GET /ledger/overview accounts[] (flattened from the Plaid
  // balances cache): institution_name/current/available — the overnight verify
  // caught this interface expecting a nonexistent `balance`/`institution`.
  accounts: Array<{
    account_id?: string;
    name?: string | null;
    institution_name?: string | null;
    mask?: string | null;
    type?: string | null;
    subtype?: string | null;
    current?: number | string | null;
    available?: number | string | null;
    is_personal_card?: boolean | number | null;
  }>;
}

// Cash-flow series colors — validated pair (dataviz six checks, light surface):
// inflow teal #0D9488 / outflow coral #E85D4A.
const INFLOW_TEAL = "#0D9488";
const OUTFLOW_CORAL = "#E85D4A";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function weekLabel(weekStart: string) {
  const [y, m, d] = String(weekStart).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return weekStart;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, mo, day] = String(d).slice(0, 10).split("-").map(Number);
  if (y && mo && day) return new Date(y, mo - 1, day).toLocaleDateString();
  return new Date(d).toLocaleDateString();
}

function toNum(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  return Number.isFinite(n as number) ? (n as number) : 0;
}

export function StellaOverviewPage() {
  const { get, ready } = useStellaApi();
  const [month, setMonth] = useState(currentMonth());
  const [ov, setOv] = useState<LedgerOverview | null>(null);
  // Plaid connections (GET /ledger/plaid/status + /items) — shown in the
  // Accounts card once itemCount > 0, until real balances land via ingestion.
  const [plaidItems, setPlaidItems] = useState<Array<{ item_id: string; institution_name?: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  // Backend contract is being shipped by a sibling build — a 404 means "not
  // live on this environment yet", which gets an honest card, not a red error.
  const [notLive, setNotLive] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotLive(false);
    try {
      const data = await get<LedgerOverview>(`/ledger/overview?month=${month}`);
      // Defensive normalize — a partial payload must never crash the landing.
      setOv({
        month: data?.month || month,
        income: toNum(data?.income),
        expenses: toNum(data?.expenses),
        net: toNum(data?.net),
        owedToYou: toNum(data?.owedToYou),
        inboxCount: toNum(data?.inboxCount),
        expensesByAccount: Array.isArray(data?.expensesByAccount) ? data.expensesByAccount : [],
        cashflow: Array.isArray(data?.cashflow) ? data.cashflow : [],
        upcomingRecurring: Array.isArray(data?.upcomingRecurring) ? data.upcomingRecurring : [],
        accounts: Array.isArray(data?.accounts) ? data.accounts : [],
      });
      // Non-fatal enrichment: connected Plaid items for the Accounts card.
      // A plaid-endpoint failure must never break the Overview.
      try {
        const [ps, pi] = await Promise.all([
          get<{ configured: boolean; itemCount: number }>("/ledger/plaid/status"),
          get<Array<{ item_id: string; institution_name?: string | null }>>("/ledger/plaid/items"),
        ]);
        setPlaidItems(Number(ps?.itemCount || 0) > 0 && Array.isArray(pi) ? pi : []);
      } catch {
        setPlaidItems([]);
      }
    } catch (e) {
      // PRE-WALK 1b: stellaApi now puts the SERVER'S SENTENCE in `message` and
      // the code in `status`, so "is this a 404" is a number to compare rather
      // than a string to search. The old substring is still accepted because a
      // non-JSON body can still come back prefixed.
      const status = (e as { status?: number })?.status;
      if (status === 404 || (e instanceof Error && e.message.includes("STELLA API 404"))) setNotLive(true);
      else setError(e);
    } finally {
      setLoading(false);
    }
  }, [get, month]);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  const isCurrentMonth = month === currentMonth();

  return (
    <StellaShell
      title="Overview"
      subtitle="Your ledger at a glance — cash in, cash out, what needs review, and what you're owed."
      showRecord
      onRecorded={() => reload()}
      actions={
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 6, color: "#0B1C24" }}
        />
      }
      error={error}
      loading={loading && !ov && !notLive}
    >
      {notLive ? (
        <div style={{ ...card, padding: "36px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0B1C24" }}>The ledger service isn't reachable yet</div>
          <div style={{ fontSize: 12, color: "#5A7A8A", marginTop: 6, maxWidth: 480, margin: "6px auto 0", lineHeight: 1.55 }}>
            The Overview reads live totals from the STELLA ledger API, which is still being deployed on this environment.
            Nothing is broken — this page fills in the moment the service is up.
          </div>
          <button
            onClick={() => reload()}
            style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", fontSize: 12, fontWeight: 600, color: "#fff", background: STELLA_INDIGO, border: 0, borderRadius: 6, cursor: "pointer" }}
          >
            <RefreshCw size={12} /> Try again
          </button>
        </div>
      ) : ov ? (
        <>
          <HeroCard ov={ov} isCurrentMonth={isCurrentMonth} />

          {/* KPI row — the four money numbers */}
          <div data-tour="stella-overview-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
            <KpiTile label="Money in" value={fmtMoney(ov.income)} hint={monthLabel(ov.month || month)} />
            <KpiTile label="Money out" value={fmtMoney(Math.abs(ov.expenses))} hint={monthLabel(ov.month || month)} />
            <KpiTile
              label="Net"
              value={fmtMoney(ov.net)}
              color={ov.net > 0 ? "#047857" : ov.net < 0 ? "#B91C1C" : undefined}
              hint={ov.net >= 0 ? "in the black" : "in the red"}
            />
            <KpiTile
              label="Owed to you"
              value={fmtMoney(ov.owedToYou)}
              color={ov.owedToYou > 0 ? STELLA_INDIGO : undefined}
              hint="personal-card expenses"
              dataTour="stella-owed-tile"
            />
          </div>

          {/* Charts — cash flow + expenses by account */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12, marginBottom: 16 }}>
            <div style={card}>
              <div style={cardTitle}>Cash flow — last 8 weeks</div>
              <div style={cardSub}>Weekly money in vs money out, across all time</div>
              {ov.cashflow.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ov.cashflow} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="weekStart" stroke="#64748B" fontSize={11} tickFormatter={weekLabel} tickLine={false} />
                    <YAxis stroke="#64748B" fontSize={11} tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`} tickLine={false} axisLine={false} width={64} />
                    <Tooltip
                      formatter={(v, name) => [fmtMoney(toNum(v as number)), name === "inflow" ? "Money in" : "Money out"]}
                      labelFormatter={(label) => `Week of ${weekLabel(String(label))}`}
                      contentStyle={{ borderRadius: 6, fontSize: 11, padding: 8 }}
                    />
                    <Legend
                      formatter={(value) => (
                        <span style={{ fontSize: 11, color: "#5A7A8A" }}>{value === "inflow" ? "Money in" : "Money out"}</span>
                      )}
                    />
                    <Bar dataKey="inflow" fill={INFLOW_TEAL} radius={[4, 4, 0, 0]} maxBarSize={18} />
                    <Bar dataKey="outflow" fill={OUTFLOW_CORAL} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty text="No cash activity in the last 8 weeks yet. Record income and expenses and the weekly picture builds itself." />
              )}
            </div>

            <div style={card}>
              <div style={cardTitle}>Expenses by account — this month</div>
              <div style={cardSub}>{monthLabel(ov.month || month)} · approved basis</div>
              {ov.expensesByAccount.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={ov.expensesByAccount} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                    <XAxis type="number" stroke="#64748B" fontSize={11} tickFormatter={(v: number) => `$${Number(v).toLocaleString()}`} tickLine={false} />
                    <YAxis type="category" dataKey="account" stroke="#64748B" fontSize={11} width={130} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v) => fmtMoney(toNum(v as number))} contentStyle={{ borderRadius: 6, fontSize: 11, padding: 8 }} />
                    <Bar dataKey="amount" fill={STELLA_INDIGO} radius={[0, 4, 4, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty text="No categorized expenses this month yet. They appear here by account as soon as they're recorded." />
              )}
            </div>
          </div>

          {/* Accounts + upcoming recurring */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 12 }}>
            <div data-tour="stella-accounts-card" style={card}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={cardTitle}>Accounts</div>
                {ov.accounts.length === 0 && plaidItems.length === 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
                    Lands with bank feeds
                  </span>
                )}
              </div>
              {ov.accounts.length === 0 && plaidItems.length > 0 ? (
                // Plaid items are connected but ingestion hasn't landed
                // balances yet — show the connections honestly, no fake numbers.
                <div style={{ marginTop: 8 }}>
                  {plaidItems.map((p, i) => (
                    <div key={p.item_id || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === plaidItems.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{p.institution_name || "Bank connection"}</div>
                      <div style={{ fontSize: 10, color: "#5A7A8A" }}>balances land after first sync</div>
                    </div>
                  ))}
                </div>
              ) : ov.accounts.length === 0 ? (
                <div style={{ padding: "18px 0 6px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 12 }}>
                    <span style={iconDisc}><Landmark size={18} color={STELLA_INDIGO} /></span>
                    <span style={iconDisc}><CreditCard size={18} color={STELLA_INDIGO} /></span>
                  </div>
                  <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.55, maxWidth: 320, margin: "0 auto" }}>
                    Connect your bank and cards to pull balances and transactions automatically.
                  </div>
                  <Link
                    to="/app/services/stella_settings_bank"
                    style={{ display: "inline-block", marginTop: 12, fontSize: 12, fontWeight: 600, color: STELLA_INDIGO, textDecoration: "none" }}
                  >
                    Bank and card accounts →
                  </Link>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {ov.accounts.map((a, i) => (
                    <div key={a.account_id || `${a.name}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === ov.accounts.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>
                          {a.name || "Account"}{a.mask ? ` ••${a.mask}` : ""}
                          {!!a.is_personal_card && (
                            <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: STELLA_INDIGO, background: `${STELLA_INDIGO}14`, padding: "1px 6px", borderRadius: 99, verticalAlign: "middle" }}>Personal</span>
                          )}
                        </div>
                        {a.institution_name && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{a.institution_name}</div>}
                      </div>
                      {a.current != null && (
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(toNum(a.current))}</div>
                          {a.available != null && toNum(a.available) !== toNum(a.current) && (
                            <div style={{ fontSize: 9, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(toNum(a.available))} available</div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={card}>
              <div style={cardTitle}>Upcoming recurring</div>
              {ov.upcomingRecurring.length === 0 ? (
                <div style={{ padding: "18px 0 6px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>Recurring obligations appear here</div>
                  <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4, lineHeight: 1.5, maxWidth: 320, margin: "4px auto 0" }}>
                    Rent, software, insurance — detected from your history and your own templates once ingestion lands.
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {ov.upcomingRecurring.map((r, i) => (
                    <div key={r.recurring_id || r.template_id || `${r.name}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: i === ov.upcomingRecurring.length - 1 ? "none" : "1px solid #F1F5F9" }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>{r.name || r.counterparty_name || "—"}</div>
                        <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1, textTransform: "capitalize" }}>
                          {[r.cadence, r.next_date ? `next ${fmtDate(r.next_date)}` : null].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      {r.amount != null && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24", fontVariantNumeric: "tabular-nums" }}>{fmtMoney(toNum(r.amount))}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </StellaShell>
  );
}

// ── Hero headline card (OliverDashboard TodayHero pattern) ──────────────────
// One tone-colored banner that picks the single most important thing:
//   inboxCount > 0  → review nudge → Inbox
//   owedToYou > 0   → reimbursement nudge → Transactions?reimbursable=open
//   any activity    → profitable / overspent verdict → Reports
//   nothing at all  → honest "nothing recorded yet"
function HeroCard({ ov, isCurrentMonth }: { ov: LedgerOverview; isCurrentMonth: boolean }) {
  const palette = {
    warn: { bg: "linear-gradient(90deg, #FEF3C7 0%, #FEF9C3 100%)", border: "#FDE68A", text: "#92400E", icon: "!" },
    info: { bg: "linear-gradient(90deg, #E8E9FA 0%, #EEF0FB 100%)", border: "#C7CBF0", text: "#3730A3", icon: "i" },
    ok: { bg: "linear-gradient(90deg, #D1FAE5 0%, #A7F3D0 100%)", border: "#6EE7B7", text: "#065F46", icon: "✓" },
  };

  const noActivity = ov.income === 0 && ov.expenses === 0 && ov.inboxCount === 0 && ov.owedToYou === 0;
  let tone: keyof typeof palette;
  let message: string;
  let action: { label: string; to: string };

  if (ov.inboxCount > 0) {
    tone = "warn";
    message = `${ov.inboxCount} transaction${ov.inboxCount === 1 ? "" : "s"} need${ov.inboxCount === 1 ? "s" : ""} review`;
    action = { label: "Open inbox", to: "/app/services/stella_ledger_inbox" };
  } else if (ov.owedToYou > 0) {
    tone = "info";
    message = `You're owed ${fmtMoney(ov.owedToYou)} in personal-card expenses`;
    action = { label: "Review reimbursements", to: "/app/services/stella_ledger_transactions?reimbursable=open" };
  } else if (noActivity) {
    tone = "info";
    message = `Nothing recorded for ${monthLabel(ov.month)} yet — use + Record to enter your first income or expense`;
    action = { label: "Open transactions", to: "/app/services/stella_ledger_transactions" };
  } else if (ov.net >= 0) {
    tone = "ok";
    message = isCurrentMonth ? "Profitable month so far" : `Profitable month — ${monthLabel(ov.month)}`;
    action = { label: "Open reports", to: "/app/services/stella_ledger_reports" };
  } else {
    tone = "warn";
    message = isCurrentMonth
      ? `Spending is ahead of income this month by ${fmtMoney(Math.abs(ov.net))}`
      : `Spending outpaced income in ${monthLabel(ov.month)} by ${fmtMoney(Math.abs(ov.net))}`;
    action = { label: "Open reports", to: "/app/services/stella_ledger_reports" };
  }

  const c = palette[tone];
  return (
    <div data-tour="stella-overview-hero" style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 16 }}>
      <div style={{ padding: 16, background: c.bg, borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: c.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
          {c.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: c.text, opacity: 0.75, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            {monthLabel(ov.month)}
          </div>
          <div style={{ fontSize: 14, color: c.text, fontWeight: 600, lineHeight: 1.4, marginTop: 2 }}>{message}</div>
        </div>
        <Link
          to={action.to}
          style={{ padding: "8px 16px", borderRadius: 8, background: c.text, color: "#fff", fontSize: 12, fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
        >
          {action.label} →
        </Link>
      </div>
    </div>
  );
}

function KpiTile({ label, value, hint, color, dataTour }: { label: string; value: string; hint?: string; color?: string; dataTour?: string }) {
  return (
    <div data-tour={dataTour} style={card}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#0B1C24", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
      <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", lineHeight: 1.55, maxWidth: 320 }}>{text}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: `1px solid ${STELLA_LAVENDER}`, borderRadius: 12, padding: "14px 18px" };
const cardTitle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: "#0B1C24" };
const cardSub: React.CSSProperties = { fontSize: 11, color: "#5A7A8A", marginBottom: 8, marginTop: 2 };
const iconDisc: React.CSSProperties = { width: 40, height: 40, borderRadius: 99, background: STELLA_LAVENDER, display: "inline-flex", alignItems: "center", justifyContent: "center" };
