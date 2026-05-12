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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!ready) return;
    const qs = rangeToQuery(range);
    (async () => {
      setLoading(true); setError(null);
      try {
        const [h, o, c] = await Promise.all([
          get<CustomerHealth>("/reports/customer-health"),
          get<{ offerings: OfferingRow[] }>(`/reports/service-profitability${qs}`),
          get<CashFlow>("/reports/cash-flow-forecast"),
        ]);
        setHealth(h);
        setOfferings(o.offerings || []);
        setCashflow(c);
      } catch (err) { setError(err); }
      finally { setLoading(false); }
    })();
  }, [get, ready, range]);

  const topOfferings = useMemo(() => offerings.slice(0, 8), [offerings]);
  const losingOfferings = useMemo(() => offerings.filter((o) => Number(o.profit) < 0), [offerings]);

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
      </div>

      {/* ── Service profitability ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-ttl">Service profitability</div>
            <div className="card-sub">Where your margin actually lives</div>
          </div>
          <Link to="/app/services/oliver_reports" style={{ fontSize: 11, color: "#1A7DB5", textDecoration: "none" }}>Full reports →</Link>
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
                      {o.margin_pct != null ? `${o.margin_pct.toFixed(0)}%` : "—"}
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
      </div>
    </OliverPageWrapper>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InsightsBanner({ health, cashflow }: { health: CustomerHealth; cashflow: CashFlow | null }) {
  // Narrative sentence summarizing the state of the business
  const atRiskCount = health.at_risk.length;
  const slowPayCount = health.slow_payers.length;
  const slowPayAmount = health.slow_payers.reduce((s, r) => s + Number(r.overdue || 0), 0);
  const next30 = cashflow?.buckets.slice(0, 5).reduce((s, b) => s + b.total_expected, 0) || 0;

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
