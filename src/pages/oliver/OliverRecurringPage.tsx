import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  StatusBadge, Button, type Column,
} from "../../components/oliver/ui";

interface Subscription {
  id: string;
  type: string;
  serviceName: string;
  description?: string;
  amount: number;
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
}

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
  const { get, post, ready } = useOliverApi();
  const [tab, setTab] = useState<Tab>("subscriptions");
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

  // Subscription KPIs
  const active = subs.filter((s) => s.status === "active");
  const mrr = active.reduce((sum, s) => {
    const amt = Number(s.amount || 0);
    if (s.billingInterval === "year") return sum + amt / 12;
    if (s.billingInterval === "week") return sum + amt * 4.33;
    return sum + amt;
  }, 0);
  const trialing = subs.filter((s) => s.status === "trialing").length;
  const pastDue = subs.filter((s) => s.status === "past_due").length;
  const cancelingSoon = subs.filter((s) => s.cancelAtPeriodEnd && s.status === "active").length;

  // Renewals in the next 30 days — drives the timeline visualization
  const nextRenewals = useMemo(() => {
    const now = Date.now();
    const cutoff = now + 30 * 86400000;
    return subs
      .filter((s) => s.status === "active" && s.currentPeriodEnd)
      .filter((s) => {
        const t = new Date(s.currentPeriodEnd!).getTime();
        return t >= now && t <= cutoff;
      })
      .sort((a, b) => new Date(a.currentPeriodEnd!).getTime() - new Date(b.currentPeriodEnd!).getTime());
  }, [subs]);
  const next30Total = nextRenewals.reduce((s, x) => s + Number(x.amount || 0), 0);

  const subColumns: Column<Subscription>[] = [
    {
      key: "service",
      header: "Service",
      sortable: true,
      sortAccessor: (s) => s.serviceName?.toLowerCase() ?? "",
      render: (s) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{s.serviceName}</div>
          {s.description && <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 1 }}>{s.description.slice(0, 60)}{s.description.length > 60 ? "…" : ""}</div>}
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
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (s) => Number(s.amount),
      render: (s) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: "#0B1C24" }}>{fmtMoney(s.amount)}</div>
          <div style={{ fontSize: 10, color: "#5A7A8A" }}>per {s.billingInterval}</div>
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
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing…" : "Sync from Stripe"}
          </Button>
        }
      />

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

      {/* Renewal timeline — only meaningful with subscriptions due in next 30 days */}
      {nextRenewals.length > 0 && (
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Renewals — next 30 days</div>
              <div className="card-sub">{fmtMoney(next30Total)} expected · {nextRenewals.length} subscription{nextRenewals.length === 1 ? "" : "s"}</div>
            </div>
          </div>
          {/* Visual timeline — each subscription as a dot positioned by % offset */}
          <div style={{ position: "relative", height: 60, marginTop: 6 }}>
            <div style={{ position: "absolute", top: 28, left: 0, right: 0, height: 3, background: "#E5E7EB", borderRadius: 99 }} />
            <div style={{ position: "absolute", top: 24, left: 0, width: 8, height: 8, borderRadius: "50%", background: "#1A3A4A", transform: "translateX(-50%)" }} />
            <div style={{ position: "absolute", top: 38, left: 0, transform: "translateX(-50%)", fontSize: 10, color: "#5A7A8A", whiteSpace: "nowrap" }}>Today</div>
            <div style={{ position: "absolute", top: 24, right: 0, width: 8, height: 8, borderRadius: "50%", background: "#5A7A8A", transform: "translateX(50%)" }} />
            <div style={{ position: "absolute", top: 38, right: 0, transform: "translateX(50%)", fontSize: 10, color: "#5A7A8A", whiteSpace: "nowrap" }}>+30 days</div>
            {nextRenewals.map((s) => {
              if (!s.currentPeriodEnd) return null;
              const daysOut = Math.max(0, Math.min(30, Math.floor((new Date(s.currentPeriodEnd).getTime() - Date.now()) / 86400000)));
              const pct = (daysOut / 30) * 100;
              const isCanceling = s.cancelAtPeriodEnd;
              return (
                <div key={s.id}
                  title={`${s.accountName || s.contactName || s.serviceName} · ${fmtMoney(s.amount)} · ${fmtDate(s.currentPeriodEnd)}${isCanceling ? " · canceling" : ""}`}
                  style={{
                    position: "absolute", top: 18, left: `${pct}%`,
                    width: 16, height: 16, borderRadius: "50%",
                    background: isCanceling ? "#9333EA" : "#1A7DB5",
                    border: "2px solid #fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    transform: "translateX(-50%)",
                    cursor: "pointer",
                    zIndex: isCanceling ? 2 : 1,
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#1A7DB5", border: "2px solid #fff", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
              <span style={{ color: "#0B1C24" }}>Auto-renewing</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#9333EA", border: "2px solid #fff", boxShadow: "0 1px 2px rgba(0,0,0,0.15)" }} />
              <span style={{ color: "#0B1C24" }}>Canceling at period end</span>
            </div>
          </div>
        </div>
      )}

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
