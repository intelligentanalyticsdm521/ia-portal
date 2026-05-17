import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, EmptyState,
  StatusBadge, Button, DetailDrawer, type Column,
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
  const [drawer, setDrawer] = useState<{ mode: "new" } | { mode: "edit"; id: string } | null>(null);
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
      key: "amount",
      header: "Amount",
      align: "right",
      sortable: true,
      sortAccessor: (s) => Number(s.amount),
      render: (s) => (
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: "#0B1C24" }}>{fmtMoney(s.amount)}</div>
          <div style={{ fontSize: 10, color: "#5A7A8A" }}>per {s.billingInterval}</div>
          {s.couponName && (
            <div style={{ fontSize: 10, color: "#9333EA" }}>
              {s.couponName}{s.discountPercent ? ` (${s.discountPercent}% off)` : s.discountAmount ? ` ($${s.discountAmount} off)` : ""}
            </div>
          )}
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
          subId={drawer.mode === "edit" ? drawer.id : undefined}
          api={{ get, post, patch }}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); reload(); }}
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
              onRowClick={(s) => setDrawer({ mode: "edit", id: s.id })}
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

interface NewLine { key: string; price_id: string; label: string; unit_amount: number; quantity: number }

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
  const [contactId, setContactId] = useState("");
  const [lines, setLines] = useState<NewLine[]>([]);
  const [trialDays, setTrialDays] = useState("");
  // shared coupon
  const [couponType, setCouponType] = useState<"none" | "percent" | "amount" | "code">("none");
  const [couponVal, setCouponVal] = useState("");
  // edit
  const [sub, setSub] = useState<(Subscription & { items?: SubItem[]; coupon_name?: string | null; discount_percent?: number | null; discount_amount?: number | null; cancel_at_period_end?: boolean; service_name?: string; status?: string }) | null>(null);
  const [editItems, setEditItems] = useState<Array<SubItem & { _deleted?: boolean }>>([]);
  const [removeCoupon, setRemoveCoupon] = useState(false);
  const [cancelAtEnd, setCancelAtEnd] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (mode === "new") {
          const [cs, os] = await Promise.all([
            api.get<ContactLite[]>("/contacts").catch(() => []),
            api.get<CatalogOffering[]>("/catalog/offerings?include_prices=1").catch(() => []),
          ]);
          setContacts(cs || []);
          setOfferings(os || []);
        } else if (subId) {
          const s = await api.get<typeof sub>(`/subscriptions/${subId}`);
          setSub(s);
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
      }))
  ), [offerings]);

  function couponBody(): Record<string, unknown> {
    if (couponType === "percent" && couponVal) return { discount_percent: Number(couponVal) };
    if (couponType === "amount" && couponVal) return { discount_amount: Number(couponVal) };
    if (couponType === "code" && couponVal) return { coupon_id: couponVal.trim() };
    return {};
  }

  async function save() {
    setErr(null); setBusy(true);
    try {
      if (mode === "new") {
        if (!contactId) throw new Error("Pick a customer.");
        if (!lines.length) throw new Error("Add at least one recurring item.");
        await api.post("/subscriptions", {
          contact_id: contactId,
          items: lines.map((l) => ({ price_id: l.price_id, quantity: l.quantity })),
          trial_days: trialDays ? Number(trialDays) : undefined,
          ...couponBody(),
        });
      } else if (subId) {
        await api.patch(`/subscriptions/${subId}`, {
          items: editItems
            .filter((i) => i._deleted || i.quantity != null)
            .map((i) => ({
              stripe_subscription_item_id: i.stripe_subscription_item_id,
              quantity: i.quantity, deleted: !!i._deleted,
            })),
          ...(removeCoupon ? { remove_coupon: true } : couponBody()),
          cancel_at_period_end: cancelAtEnd,
        });
      }
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
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
              if (p) setLines((prev) => [...prev, { key: crypto.randomUUID(), price_id: p.price_id, label: p.label, unit_amount: p.unit_amount, quantity: 1 }]);
            }}>
              <option value="">— Add a recurring price —</option>
              {allPrices.map((p) => <option key={p.price_id} value={p.price_id}>{p.label}</option>)}
            </select>
            {!allPrices.length && <div style={{ fontSize: 11, color: "#B45309", marginTop: 4 }}>No recurring prices in your catalog yet — add monthly/annual prices to a product first.</div>}
          </div>
          {lines.length > 0 && (
            <div style={{ border: "1px solid #eef2f4", borderRadius: 8 }}>
              {lines.map((l, i) => (
                <div key={l.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: i < lines.length - 1 ? "1px solid #f0f4f6" : "none" }}>
                  <div style={{ flex: 1, fontSize: 12 }}>{l.label}</div>
                  <input type="number" min={1} value={l.quantity} style={{ ...inS, width: 64 }}
                    onChange={(e) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))} />
                  <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} style={{ color: "#dc2626", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <Lbl>Discount (optional)</Lbl>
            <div style={{ display: "flex", gap: 8 }}>
              <select style={{ ...inS, width: 160 }} value={couponType} onChange={(e) => setCouponType(e.target.value as never)}>
                <option value="none">No discount</option>
                <option value="percent">% off</option>
                <option value="amount">$ off</option>
                <option value="code">Existing coupon ID</option>
              </select>
              {couponType !== "none" && (
                <input style={inS} value={couponVal} onChange={(e) => setCouponVal(e.target.value)}
                  placeholder={couponType === "percent" ? "e.g. 30" : couponType === "amount" ? "e.g. 25" : "coupon_xxx"} />
              )}
            </div>
          </div>
          <div>
            <Lbl>Free trial days (optional)</Lbl>
            <input style={{ ...inS, width: 120 }} type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} />
          </div>
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <select style={{ ...inS, width: 160 }} value={couponType} onChange={(e) => setCouponType(e.target.value as never)}>
                      <option value="none">Keep / no change</option>
                      <option value="percent">Set % off</option>
                      <option value="amount">Set $ off</option>
                      <option value="code">Apply coupon ID</option>
                    </select>
                    {couponType !== "none" && (
                      <input style={inS} value={couponVal} onChange={(e) => setCouponVal(e.target.value)}
                        placeholder={couponType === "percent" ? "e.g. 30" : couponType === "amount" ? "e.g. 25" : "coupon_xxx"} />
                    )}
                  </div>
                )}
              </div>
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
