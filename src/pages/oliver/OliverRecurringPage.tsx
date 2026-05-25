import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  StatusBadge, Button, DetailDrawer, TimeRangeSelector, rangeForPreset, type Column,
} from "../../components/oliver/ui";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
} from "recharts";
import { SubscriptionModal } from "./SubscriptionModal";

interface Subscription {
  id: string;
  type: string;
  serviceName: string;
  description?: string;
  amount: number;
  discountTotal?: number | null;
  taxTotal?: number | null;
  netAmount?: number | null;
  currency: string;
  billingInterval: string;
  billingIntervalCount?: number;
  status: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  syncedFromStripe?: boolean;
  createdAt: string;
  contactName?: string;
  accountName?: string;
  contactEmail?: string;
  contactId?: string;
  lineItems?: string | null;
  couponName?: string | null;
  discountPercent?: number | null;
  discountAmount?: number | null;
}

interface SubItem {
  item_id: string;
  product_name: string;
  unit_amount: number;
  quantity: number;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  stripe_price_id?: string | null;
  stripe_subscription_item_id?: string | null;
}
interface CatalogOffering {
  offering_id: string;
  name: string;
  prices?: Array<{ price_id: string; stripe_price_id?: string | null; unit_amount: number; recurring_interval?: string | null; recurring_interval_count?: number | null; pricing_model?: string | null; label?: string | null }>;
}
interface ContactLite { contact_id: string; first_name?: string; last_name?: string; company_name?: string; email?: string }

interface RecurringJob {
  id: string;
  title: string;
  customerName: string;
  frequency: string;
  nextRunDate: string;
  status: string;
}

type Tab = "subscriptions" | "recurring";

const FILTER_PILLS = [
  { key: "", label: "All" },
  { key: "status:active", label: "Active" },
  { key: "status:trialing", label: "Trialing" },
  { key: "status:past_due", label: "Past due" },
  { key: "status:canceled", label: "Canceled" },
];

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export function OliverRecurringPage() {
  const { get, post, patch, ready } = useOliverApi();
  const [tab, setTab] = useState<Tab>("subscriptions");
  // drawer: legacy create/edit form (still used for "new"). Phase 1C added a
  // richer SubscriptionModal that owns the "view/manage existing sub" path —
  // openModalId drives that one.
  const [drawer, setDrawer] = useState<{ mode: "new" } | null>(null);
  const [openModalId, setOpenModalId] = useState<string | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [recurring, setRecurring] = useState<RecurringJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, r] = await Promise.all([
        get<Subscription[]>("/subscriptions"),
        get<RecurringJob[]>("/recurring-jobs").catch(() => []),
      ]);
      setSubs(s || []);
      setRecurring(r || []);
    } catch (err) { setError(err); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      // /settings/stripe/import is connect-aware: falls back to platform key when
      // the tenant has no connected account on file. This works for the IADM tenant
      // (which IS the platform owner) and any client tenant with Connect set up.
      const result = await post<{ ok: boolean; products?: number; customers?: number; subscriptions?: number; invoices?: number; error?: string }>(
        "/settings/stripe/import"
      );
      const parts: string[] = [];
      if (result?.subscriptions) parts.push(`${result.subscriptions} subs`);
      if (result?.customers) parts.push(`${result.customers} customers`);
      if (result?.products) parts.push(`${result.products} products`);
      if (result?.invoices) parts.push(`${result.invoices} invoices`);
      setSyncMsg(parts.length ? `Synced from Stripe: ${parts.join(" · ")}` : "Sync complete — nothing new.");
      await reload();
    } catch (err) {
      setSyncMsg(`Sync failed: ${(err as Error).message || "unknown error"}`);
    } finally {
      setSyncing(false);
    }
  }

  const filteredSubs = useMemo(() => {
    let list = subs;
    if (filter.startsWith("status:")) {
      const s = filter.split(":")[1];
      list = list.filter((x) => x.status === s);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((x) =>
        x.serviceName?.toLowerCase().includes(q) ||
        x.accountName?.toLowerCase().includes(q) ||
        x.contactName?.toLowerCase().includes(q) ||
        x.contactEmail?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [subs, filter, search]);

  // NET revenue per period (post-coupon, ex-tax). Falls back to gross only
  // when net hasn't been computed yet (pre-resync rows).
  const netOf = (s: Subscription) => Number(s.netAmount != null ? s.netAmount : s.amount || 0);

  // Subscription KPIs — MRR off NET, not list price.
  const active = subs.filter((s) => s.status === "active");
  const mrr = active.reduce((sum, s) => {
    const amt = netOf(s);
    if (s.billingInterval === "year") return sum + amt / 12;
    if (s.billingInterval === "week") return sum + amt * 4.33;
    return sum + amt;
  }, 0);
  const trialing = subs.filter((s) => s.status === "trialing").length;
  const pastDue = subs.filter((s) => s.status === "past_due").length;
  const cancelingSoon = subs.filter((s) => s.cancelAtPeriodEnd && s.status === "active").length;


  // Adjustable forecast window (ARION standard) + previous-period comparison.
  const [forecastRange, setForecastRange] = useState(() => rangeForPreset("next_90_days"));

  function cycleDays(s: Subscription): number {
    const n = s.billingIntervalCount || 1;
    if (s.billingInterval === "year") return 365 * n;
    if (s.billingInterval === "week") return 7 * n;
    return 30.44 * n; // month default
  }

  const renewalChart = useMemo(() => {
    const now = Date.now();
    const end = forecastRange.toISO ? new Date(forecastRange.toISO).getTime() : now + 90 * 86400000;
    const windowMs = Math.max(86400000, end - now);
    const windowDays = windowMs / 86400000;
    const bucketDays = windowDays <= 35 ? 7 : windowDays <= 110 ? 7 : windowDays <= 210 ? 14 : 30;
    const buckets = Math.max(1, Math.ceil(windowDays / bucketDays));
    const fmtLbl = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
    const rows = Array.from({ length: buckets }, (_, i) => ({
      label: fmtLbl(now + i * bucketDays * 86400000),
      upcoming: 0, previous: 0, count: 0,
    }));
    for (const s of subs) {
      if (s.status !== "active" || !s.currentPeriodEnd) continue;
      const amt = netOf(s); // forecast actual net revenue, not list price
      const renewMs = new Date(s.currentPeriodEnd).getTime();
      // Upcoming: this renewal falls inside the forecast window.
      const off = (renewMs - now) / 86400000;
      if (off >= 0 && off <= windowDays) {
        const b = Math.min(buckets - 1, Math.floor(off / bucketDays));
        rows[b].upcoming += amt; rows[b].count += 1;
      }
      // Previous period: the prior billing cycle of this same sub, mapped to
      // the equivalent bucket (real cadence, not invented data).
      const priorMs = renewMs - cycleDays(s) * 86400000;
      const poff = (priorMs - (now - windowMs)) / 86400000;
      if (poff >= 0 && poff <= windowDays) {
        const b = Math.min(buckets - 1, Math.floor(poff / bucketDays));
        rows[b].previous += amt;
      }
    }
    return rows;
  }, [subs, forecastRange]);
  const renewalChartHasData = renewalChart.some((w) => w.count > 0 || w.previous > 0);
  const forecastTotal = renewalChart.reduce((s, r) => s + r.upcoming, 0);
  const priorTotal = renewalChart.reduce((s, r) => s + r.previous, 0);

  // Subscription mix by status — always renders bars.
  const statusMix = useMemo(() => {
    const order: Array<{ key: string; label: string; color: string }> = [
      { key: "active", label: "Active", color: "#1A7DB5" },
      { key: "trialing", label: "Trialing", color: "#10B981" },
      { key: "past_due", label: "Past due", color: "#F59E0B" },
      { key: "canceled", label: "Canceled", color: "#94A3B8" },
    ];
    return order.map((o) => ({
      ...o,
      count: o.key === "canceled"
        ? subs.filter((s) => s.status === "canceled" || s.cancelAtPeriodEnd).length
        : subs.filter((s) => s.status === o.key).length,
    }));
  }, [subs]);
  const statusMixHasData = statusMix.some((s) => s.count > 0);

  const subColumns: Column<Subscription>[] = [
    {
      key: "service",
      header: "Service",
      sortable: true,
      sortAccessor: (s) => s.serviceName?.toLowerCase() ?? "",
      render: (s) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.serviceName}</div>
          {s.lineItems && s.lineItems !== s.serviceName
            ? <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{s.lineItems}</div>
            : s.description && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{s.description.slice(0, 60)}{s.description.length > 60 ? "…" : ""}</div>}
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer",
      render: (s) => (
        <div>
          <div style={{ fontSize: 12, color: "#0B1C24" }}>{s.accountName || s.contactName || "—"}</div>
          {s.contactEmail && <div style={{ fontSize: 10, color: "#5A7A8A" }}>{s.contactEmail}</div>}
        </div>
      ),
    },
    {
      key: "listprice", header: "List price", align: "right",
      render: (s) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: "#5A7A8A" }}>{fmtMoney(s.amount)}</div>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>per {s.billingInterval}</div>
        </div>
      ),
    },
    {
      key: "discount", header: "Discount", align: "right",
      render: (s) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontFamily: "monospace", color: Number(s.discountTotal) > 0 ? "#059669" : "#94A3B8" }}>
            {Number(s.discountTotal) > 0 ? `−${fmtMoney(s.discountTotal)}` : "—"}
          </div>
          {s.couponName && <div style={{ fontSize: 10, color: "#9333EA" }}>{s.couponName}</div>}
        </div>
      ),
    },
    {
      key: "tax", header: "Tax", align: "right",
      render: (s) => (
        <div style={{ fontSize: 12, fontFamily: "monospace", textAlign: "right", color: Number(s.taxTotal) > 0 ? "#B45309" : "#94A3B8" }}>
          {Number(s.taxTotal) > 0 ? fmtMoney(s.taxTotal) : "—"}
        </div>
      ),
    },
    {
      key: "net", header: "Net /period", align: "right", sortable: true,
      sortAccessor: (s) => netOf(s),
      render: (s) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: "#0B1C24" }}>{fmtMoney(netOf(s))}</div>
          <div style={{ fontSize: 10, color: "#94A3B8" }}>actually billed</div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (s) => <StatusBadge status={s.status} /> },
    {
      key: "renewal", header: "Renews",
      render: (s) => (
        <span style={{ fontSize: 12, color: "#5A7A8A" }}>
          {fmtDate(s.currentPeriodEnd)}
          {s.cancelAtPeriodEnd && <span style={{ color: "#D97706", marginLeft: 4 }}>(canceling)</span>}
        </span>
      ),
    },
    {
      key: "source", header: "Source",
      render: (s) => (
        <span style={{ fontSize: 10, color: "#5A7A8A", textTransform: "uppercase" }}>
          {s.syncedFromStripe ? "Stripe sync" : "Created in OLIVER"}
        </span>
      ),
    },
  ];

  const recColumns: Column<RecurringJob>[] = [
    { key: "title", header: "Job template", render: (r) => <strong style={{ color: "#0B1C24" }}>{r.title}</strong> },
    { key: "customer", header: "Customer", render: (r) => r.customerName || "—" },
    { key: "frequency", header: "Frequency", render: (r) => r.frequency },
    { key: "nextRun", header: "Next run", render: (r) => fmtDate(r.nextRunDate) },
    { key: "status", header: "Status", render: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <OliverPageWrapper title="Recurring & Subscriptions" subtitle="Manage Stripe subscriptions and recurring job templates" error={error} loading={loading}>
      <PageHeader
        title="Recurring & Subscriptions"
        subtitle="Sync, monitor, and cancel customer subscriptions backed by Stripe"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync from Stripe"}
            </Button>
            <Button variant="primary" onClick={() => setDrawer({ mode: "new" })}>+ New subscription</Button>
          </div>
        }
      />

      {drawer && (
        <SubscriptionDrawer
          mode={drawer.mode}
          api={{ get, post, patch }}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); reload(); }}
        />
      )}

      {openModalId && (
        <SubscriptionModal
          subscriptionId={openModalId}
          onClose={() => setOpenModalId(null)}
          onChanged={reload}
        />
      )}

      {syncMsg && (
        <div className="card" style={{ background: "#E8F4FB", borderColor: "rgba(45,156,219,0.3)" }}>
          <div style={{ fontSize: 12, color: "#0C4A60" }}>{syncMsg}</div>
        </div>
      )}

      <div className="stat-row">
        <div className="stat-card" style={{ background: "linear-gradient(135deg, #1A3A4A 0%, #0C4A60 100%)", color: "#fff" }}>
          <div className="stat-lbl" style={{ color: "#A8CDD8" }}>Estimated MRR</div>
          <div className="stat-val" style={{ color: "#fff" }}>{fmtMoney(mrr)}</div>
          <div className="stat-delta" style={{ color: "#A8CDD8" }}>{active.length} active subscription{active.length === 1 ? "" : "s"}</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Trialing</div>
          <div className="stat-val">{trialing}</div>
          <div className="stat-delta neu">on trial period</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Past due</div>
          <div className="stat-val" style={{ color: pastDue > 0 ? "#D97706" : undefined }}>{pastDue}</div>
          <div className="stat-delta neu">payment failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Canceling</div>
          <div className="stat-val" style={{ color: cancelingSoon > 0 ? "#9333EA" : undefined }}>{cancelingSoon}</div>
          <div className="stat-delta neu">won't auto-renew</div>
        </div>
      </div>

      {/* Renewal forecast + status mix — real charts */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div className="card">
          <div className="card-hdr" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <div className="card-ttl">Renewal forecast — {forecastRange.label}</div>
              <div className="card-sub">
                {fmtMoney(forecastTotal)} expected · prior period {fmtMoney(priorTotal)}
                {priorTotal > 0 && (
                  <span style={{ color: forecastTotal >= priorTotal ? "#059669" : "#DC2626", marginLeft: 6 }}>
                    ({forecastTotal >= priorTotal ? "+" : ""}{Math.round(((forecastTotal - priorTotal) / priorTotal) * 100)}%)
                  </span>
                )}
              </div>
            </div>
            <TimeRangeSelector value={forecastRange} onChange={setForecastRange} mode="forecast" />
          </div>
          {renewalChartHasData ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={renewalChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`} />
                <Tooltip
                  formatter={(v, n) => [`${fmtMoney(Number(v) || 0)}`, n === "previous" ? "Prior period" : "Upcoming"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Prior period" dataKey="previous" radius={[4, 4, 0, 0]} fill="#CBD5E1" maxBarSize={28} />
                <Bar name="Upcoming" dataKey="upcoming" radius={[4, 4, 0, 0]} fill="#1A7DB5" maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#5A7A8A", fontSize: 13 }}>
              No active subscriptions renewing in {forecastRange.label.toLowerCase()}.
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Subscription mix</div>
              <div className="card-sub">{subs.length} total · {fmtMoney(mrr)} MRR</div>
            </div>
          </div>
          {statusMixHasData ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={statusMix} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="#64748B" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={11} width={64} tickLine={false} axisLine={false} />
                <Tooltip
                  formatter={(v) => [`${Number(v) || 0}`, "Subscriptions"]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #E5E7EB" }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {statusMix.map((s) => <Cell key={s.key} fill={s.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ padding: "48px 0", textAlign: "center", color: "#5A7A8A", fontSize: 13 }}>
              No subscriptions yet.
            </div>
          )}
        </div>
      </div>

      <div className="ptabs" style={{ marginBottom: 12 }}>
        <button className={`ptab${tab === "subscriptions" ? " active" : ""}`} onClick={() => setTab("subscriptions")}>Subscriptions ({subs.length})</button>
        <button className={`ptab${tab === "recurring" ? " active" : ""}`} onClick={() => setTab("recurring")}>Recurring jobs ({recurring.length})</button>
      </div>

      {tab === "subscriptions" && (
        !subs.length ? (
          <EmptyState
            title="No subscriptions yet"
            description="Subscriptions appear here when you create one in OLIVER, or when a customer signs up to a recurring offering. You can also click Sync from Stripe to import any existing subscriptions from your Stripe account."
          />
        ) : (
          <>
            <FilterBar
              pills={FILTER_PILLS}
              activePill={filter}
              onPillChange={setFilter}
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search service, customer, or email…"
            />
            <DataTable
              rows={filteredSubs}
              columns={subColumns}
              rowKey={(s) => s.id}
              onRowClick={(s) => setOpenModalId(s.id)}
              initialSort={{ key: "service", direction: "asc" }}
              emptyMessage="No subscriptions match these filters."
            />
          </>
        )
      )}

      {tab === "recurring" && (
        !recurring.length ? (
          <EmptyState
            title="No recurring job templates"
            description="Create job templates that automatically generate jobs on a schedule (weekly lawn care, monthly maintenance, quarterly checkups). Available with Standard plan and above."
          />
        ) : (
          <DataTable
            rows={recurring}
            columns={recColumns}
            rowKey={(r) => r.id}
            emptyMessage="No recurring templates."
          />
        )
      )}
    </OliverPageWrapper>
  );
}

const inS: CSSProperties = { display: "block", width: "100%", borderRadius: 8, border: "1px solid #cbd5e1", padding: "8px 10px", fontSize: 13 };
function Lbl({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>{children}</div>;
}

interface CouponLite { coupon_id: string; code: string; name?: string | null; percent_off?: number | null; amount_off?: number | null }
interface LineDisc { mode: "none" | "coupon" | "percent" | "amount"; couponId: string; value: string }
const NO_LD: LineDisc = { mode: "none", couponId: "", value: "" };
interface NewLine {
  key: string; price_id: string; label: string;
  unit_amount: number;        // editable custom price for THIS subscription
  catalog_amount: number;     // original catalog price (to detect override)
  recurring_interval: string; recurring_interval_count: number;
  quantity: number; discount: LineDisc;
}

// Real-coupon dropdown (+ optional manual % / $). Used per-line and whole-sub.
function CouponPick({ d, coupons, onChange, mini }: {
  d: LineDisc; coupons: CouponLite[]; onChange: (d: LineDisc) => void; mini?: boolean;
}) {
  const st: React.CSSProperties = { padding: mini ? "4px 6px" : "8px 10px", fontSize: mini ? 11 : 13, borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff" };
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <select style={{ ...st, width: mini ? 92 : 150 }} value={d.mode}
        onChange={(e) => onChange({ ...d, mode: e.target.value as LineDisc["mode"] })}>
        <option value="none">No discount</option>
        <option value="coupon">Coupon</option>
        <option value="percent">% off</option>
        <option value="amount">$ off</option>
      </select>
      {d.mode === "coupon" && (
        <select style={{ ...st, width: mini ? 170 : 220 }} value={d.couponId}
          onChange={(e) => onChange({ ...d, couponId: e.target.value })}>
          <option value="">— pick a coupon —</option>
          {coupons.map((c) => (
            <option key={c.coupon_id} value={c.coupon_id}>
              {c.code}{c.percent_off != null ? ` (${c.percent_off}% off)` : c.amount_off != null ? ` ($${c.amount_off} off)` : ""}
            </option>
          ))}
        </select>
      )}
      {(d.mode === "percent" || d.mode === "amount") && (
        <input type="number" min={0} step="0.01" style={{ ...st, width: 70, textAlign: "right" }}
          placeholder={d.mode === "percent" ? "%" : "$"} value={d.value}
          onChange={(e) => onChange({ ...d, value: e.target.value })} />
      )}
    </span>
  );
}

function SubscriptionDrawer({ mode, subId, api, onClose, onSaved }: {
  mode: "new" | "edit";
  subId?: string;
  api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T> };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // new
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [coupons, setCoupons] = useState<CouponLite[]>([]);
  const [contactId, setContactId] = useState("");
  const [lines, setLines] = useState<NewLine[]>([]);
  const [trialDays, setTrialDays] = useState("");
  const [taxRate, setTaxRate] = useState(""); // % applied to the subscription
  // whole-subscription discount
  const [subDisc, setSubDisc] = useState<LineDisc>({ ...NO_LD });
  // edit
  const [sub, setSub] = useState<(Subscription & { items?: SubItem[]; coupon_name?: string | null; discount_percent?: number | null; discount_amount?: number | null; cancel_at_period_end?: boolean; service_name?: string; status?: string }) | null>(null);
  const [editItems, setEditItems] = useState<Array<SubItem & { _deleted?: boolean }>>([]);
  const [removeCoupon, setRemoveCoupon] = useState(false);
  const [cancelAtEnd, setCancelAtEnd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (mode === "new") {
          const [cs, os, cp] = await Promise.all([
            api.get<ContactLite[]>("/contacts").catch(() => []),
            api.get<CatalogOffering[]>("/catalog/offerings?include_prices=1").catch(() => []),
            api.get<CouponLite[]>("/coupons").catch(() => []),
          ]);
          setContacts(cs || []);
          setOfferings(os || []);
          setCoupons(cp || []);
        } else if (subId) {
          const [s, cp] = await Promise.all([
            api.get<typeof sub>(`/subscriptions/${subId}`),
            api.get<CouponLite[]>("/coupons").catch(() => []),
          ]);
          setSub(s);
          setCoupons(cp || []);
          setEditItems((s?.items ?? []).map((i) => ({ ...i })));
          setCancelAtEnd(!!s?.cancel_at_period_end);
        }
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [mode, subId, api]);

  const allPrices = useMemo(() => offerings.flatMap((o) =>
    (o.prices ?? [])
      .filter((p) => p.pricing_model === "recurring" || p.recurring_interval)
      .map((p) => ({
        offering: o.name, price_id: p.price_id,
        label: `${o.name} · $${Number(p.unit_amount).toFixed(2)}/${p.recurring_interval_count && p.recurring_interval_count > 1 ? `${p.recurring_interval_count} ` : ""}${p.recurring_interval}${p.label ? ` (${p.label})` : ""}`,
        unit_amount: Number(p.unit_amount),
        recurring_interval: p.recurring_interval || "month",
        recurring_interval_count: p.recurring_interval_count || 1,
      }))
  ), [offerings]);

  // Map a LineDisc to the API discount fields.
  function discBody(d: LineDisc): Record<string, unknown> {
    if (d.mode === "coupon" && d.couponId) return { coupon_id: d.couponId };
    if (d.mode === "percent" && d.value) return { discount_percent: Number(d.value) };
    if (d.mode === "amount" && d.value) return { discount_amount: Number(d.value) };
    return {};
  }

  // $ off a base for a LineDisc (real coupon, % or $).
  function discAmt(d: LineDisc | undefined, base: number): number {
    if (!d || d.mode === "none" || base <= 0) return 0;
    if (d.mode === "percent") return Math.max(0, base * (Number(d.value) || 0) / 100);
    if (d.mode === "amount") return Math.min(base, Math.max(0, Number(d.value) || 0));
    if (d.mode === "coupon") {
      const c = coupons.find((x) => x.coupon_id === d.couponId);
      if (!c) return 0;
      if (c.percent_off != null) return base * Number(c.percent_off) / 100;
      if (c.amount_off != null) return Math.min(base, Number(c.amount_off));
    }
    return 0;
  }

  // Live totals per billing period — new mode (lines) and edit mode (editItems).
  const totals = useMemo(() => {
    const src = mode === "new"
      ? lines.map((l) => ({ amt: Number(l.unit_amount) * Number(l.quantity || 1), disc: l.discount }))
      : editItems.filter((i) => !i._deleted).map((i) => ({ amt: Number(i.unit_amount) * Number(i.quantity || 1), disc: undefined as LineDisc | undefined }));
    let gross = 0, lineDiscounts = 0;
    for (const r of src) { gross += r.amt; lineDiscounts += discAmt(r.disc, r.amt); }
    const afterLine = Math.max(0, gross - lineDiscounts);
    const subDiscount = discAmt(subDisc, afterLine);
    const taxable = Math.max(0, gross - lineDiscounts - subDiscount);
    const tax = taxable * ((Number(taxRate) || 0) / 100);
    return { gross, lineDiscounts, subDiscount, tax, total: taxable + tax };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, lines, editItems, subDisc, taxRate, coupons]);

  const period = mode === "new"
    ? (lines[0]?.recurring_interval_count > 1 ? `every ${lines[0]?.recurring_interval_count} ${lines[0]?.recurring_interval}s` : `/${lines[0]?.recurring_interval || "mo"}`)
    : (sub?.billingInterval ? `/${sub.billingInterval}` : "");

  async function save() {
    setErr(null); setBusy(true);
    try {
      if (mode === "new") {
        if (!contactId) throw new Error("Pick a customer.");
        if (!lines.length) throw new Error("Add at least one recurring item.");
        await api.post("/subscriptions", {
          contact_id: contactId,
          items: lines.map((l) => {
            const overridden = Number(l.unit_amount) !== Number(l.catalog_amount);
            const base: Record<string, unknown> = overridden
              // custom price for THIS subscription → ad-hoc price, not the catalog one
              ? { product_name: l.label.split(" · ")[0], unit_amount: Number(l.unit_amount),
                  recurring_interval: l.recurring_interval, recurring_interval_count: l.recurring_interval_count }
              : { price_id: l.price_id };
            return { ...base, quantity: l.quantity, ...discBody(l.discount) };
          }),
          trial_days: trialDays ? Number(trialDays) : undefined,
          tax_percent: taxRate ? Number(taxRate) : undefined,
          ...discBody(subDisc),
        });
      } else if (subId) {
        await api.patch(`/subscriptions/${subId}`, {
          items: editItems
            .filter((i) => i._deleted || i.quantity != null)
            .map((i) => ({
              stripe_subscription_item_id: i.stripe_subscription_item_id,
              quantity: i.quantity, deleted: !!i._deleted,
            })),
          tax_percent: taxRate ? Number(taxRate) : undefined,
          ...(removeCoupon ? { remove_coupon: true } : discBody(subDisc)),
          cancel_at_period_end: cancelAtEnd,
        });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  const TR = ({ label, val, color }: { label: string; val: string; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12, color: color || "#5A7A8A" }}>
      <span>{label}</span><span style={{ fontFamily: "monospace", color: color || "#0B1C24" }}>{val}</span>
    </div>
  );
  function TotalsBlock() {
    return (
      <div style={{ borderTop: "1px solid #eef2f4", paddingTop: 10 }}>
        <Lbl>Tax</Lbl>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <input type="number" min={0} step="0.001" placeholder="0" value={taxRate}
            onChange={(e) => setTaxRate(e.target.value)} style={{ ...inS, width: 80, textAlign: "right" }} />
          <span style={{ fontSize: 12, color: "#5A7A8A" }}>% sales tax</span>
        </div>
        <div style={{ maxWidth: 320, marginLeft: "auto" }}>
          <TR label="Subtotal" val={`$${totals.gross.toFixed(2)}`} />
          {totals.lineDiscounts > 0 && <TR label="Line discounts" val={`−$${totals.lineDiscounts.toFixed(2)}`} color="#059669" />}
          {totals.subDiscount > 0 && <TR label="Subscription discount" val={`−$${totals.subDiscount.toFixed(2)}`} color="#059669" />}
          {totals.tax > 0 && <TR label={`Tax (${Number(taxRate)}%)`} val={`$${totals.tax.toFixed(2)}`} color="#B45309" />}
          <div style={{ borderTop: "1px solid #eef2f4", marginTop: 4, paddingTop: 6, fontWeight: 700 }}>
            <TR label={`Total ${period}`} val={`$${totals.total.toFixed(2)}`} color="#0B1C24" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <DetailDrawer
      open onClose={onClose} width="lg"
      title={mode === "new" ? "New subscription" : (sub?.service_name || "Edit subscription")}
      subtitle={mode === "new" ? "Created in Stripe + OLIVER in one step — no Stripe trip" : "Changes sync to Stripe immediately"}
      footer={<>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" loading={busy} onClick={save}>{mode === "new" ? "Create subscription" : "Save changes"}</Button>
      </>}
    >
      {err && <div style={{ background: "#FEE2E2", color: "#991B1B", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {mode === "new" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Lbl>Customer</Lbl>
            <select style={inS} value={contactId} onChange={(e) => setContactId(e.target.value)}>
              <option value="">— Select a customer —</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Lbl>Add recurring item (from catalog)</Lbl>
            <select style={inS} value="" onChange={(e) => {
              const p = allPrices.find((x) => x.price_id === e.target.value);
              if (p) setLines((prev) => [...prev, {
                key: crypto.randomUUID(), price_id: p.price_id, label: p.label,
                unit_amount: p.unit_amount, catalog_amount: p.unit_amount,
                recurring_interval: p.recurring_interval, recurring_interval_count: p.recurring_interval_count,
                quantity: 1, discount: { ...NO_LD },
              }]);
            }}>
              <option value="">— Add a recurring price —</option>
              {allPrices.map((p) => <option key={p.price_id} value={p.price_id}>{p.label}</option>)}
            </select>
            {!allPrices.length && <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>No recurring prices in your catalog yet — add monthly/annual prices to a product first.</div>}
          </div>
          {lines.length > 0 && (
            <div style={{ border: "1px solid #eef2f4", borderRadius: 8 }}>
              {lines.map((l, i) => (
                <div key={l.key} style={{ padding: "10px", borderBottom: i < lines.length - 1 ? "1px solid #f0f4f6" : "none" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 64px 60px", gap: 8, alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: "#0B1C24" }}>{l.label.split(" · ")[0]}
                      <span style={{ color: "#94A3B8" }}> · /{l.recurring_interval_count > 1 ? `${l.recurring_interval_count} ` : ""}{l.recurring_interval}</span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 11, color: "#94A3B8" }}>$</span>
                      <input type="number" min={0} step="0.01" value={l.unit_amount} title="Custom price for this subscription"
                        style={{ ...inS, width: 90, textAlign: "right" }}
                        onChange={(e) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, unit_amount: Number(e.target.value) } : x))} />
                    </span>
                    <input type="number" min={1} value={l.quantity} title="Qty" style={{ ...inS, width: 56, textAlign: "right" }}
                      onChange={(e) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                    <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} style={{ color: "#dc2626", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                    <span style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>Line discount</span>
                    <CouponPick mini d={l.discount} coupons={coupons}
                      onChange={(d) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, discount: d } : x))} />
                    {l.unit_amount !== l.catalog_amount && <span style={{ fontSize: 10, color: "#1A7DB5" }}>custom price</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <Lbl>Whole-subscription discount (optional)</Lbl>
            <CouponPick d={subDisc} coupons={coupons} onChange={setSubDisc} />
          </div>
          <div>
            <Lbl>Free trial days (optional)</Lbl>
            <input style={{ ...inS, width: 120 }} type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </div>
          <TotalsBlock />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!sub ? <div style={{ color: "#5A7A8A" }}>Loading…</div> : (
            <>
              <div style={{ fontSize: 12, color: "#5A7A8A" }}>
                {sub.accountName || sub.contactName} · <StatusBadge status={sub.status || "active"} /> · renews {fmtDate(sub.currentPeriodEnd)}
              </div>
              <div>
                <Lbl>Line items</Lbl>
                <div style={{ border: "1px solid #eef2f4", borderRadius: 8 }}>
                  {editItems.map((it, i) => (
                    <div key={it.item_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: i < editItems.length - 1 ? "1px solid #f0f4f6" : "none", opacity: it._deleted ? 0.4 : 1 }}>
                      <div style={{ flex: 1, fontSize: 12 }}>
                        {it.product_name} · ${Number(it.unit_amount).toFixed(2)}{it.recurring_interval ? `/${it.recurring_interval}` : ""}
                      </div>
                      <input type="number" min={1} value={it.quantity} disabled={it._deleted} style={{ ...inS, width: 64 }}
                        onChange={(e) => setEditItems((prev) => prev.map((x) => x.item_id === it.item_id ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                      <button onClick={() => setEditItems((prev) => prev.map((x) => x.item_id === it.item_id ? { ...x, _deleted: !x._deleted } : x))}
                        style={{ color: it._deleted ? "#0C4A60" : "#dc2626", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
                        {it._deleted ? "Undo" : "Remove"}
                      </button>
                    </div>
                  ))}
                  {!editItems.length && <div style={{ padding: 12, fontSize: 12, color: "#5A7A8A" }}>No line items synced. Run “Sync from Stripe”.</div>}
                </div>
              </div>
              <div>
                <Lbl>Discount</Lbl>
                <div style={{ fontSize: 12, marginBottom: 6 }}>
                  {sub.coupon_name
                    ? <>Current: <span style={{ color: "#9333EA" }}>{sub.coupon_name}{sub.discount_percent ? ` (${sub.discount_percent}% off)` : sub.discount_amount ? ` ($${sub.discount_amount} off)` : ""}</span></>
                    : "No discount applied"}
                </div>
                {sub.coupon_name && (
                  <label style={{ display: "flex", gap: 8, fontSize: 12, marginBottom: 6 }}>
                    <input type="checkbox" checked={removeCoupon} onChange={(e) => setRemoveCoupon(e.target.checked)} /> Remove current discount
                  </label>
                )}
                {!removeCoupon && (
                  <CouponPick d={subDisc} coupons={coupons} onChange={setSubDisc} />
                )}
              </div>
              <TotalsBlock />
              <label style={{ display: "flex", gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={cancelAtEnd} onChange={(e) => setCancelAtEnd(e.target.checked)} />
                Cancel at period end (stops billing after {fmtDate(sub.currentPeriodEnd)})
              </label>
            </>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}
