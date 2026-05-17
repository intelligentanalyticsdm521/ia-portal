import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import {
  PageHeader, FilterBar, DataTable, DetailDrawer, EmptyState, Button,
  StatusBadge, type Column,
} from "../../components/oliver/ui";

interface Category {
  category_id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}

interface PriceVariant {
  price_id: string;
  pricing_model: "one_time" | "recurring";
  unit_amount: number;
  currency: string;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  trial_days?: number | null;
  label?: string | null;
  is_default: boolean;
  is_active: boolean;
  stripe_price_id?: string | null;
}

interface Offering {
  offering_id: string;
  category_id?: string | null;
  category_name?: string | null;
  category_color?: string | null;
  name: string;
  description?: string | null;
  default_duration_minutes?: number | null;
  is_active: boolean;
  is_self_bookable: boolean;
  requires_quote: boolean;
  stripe_product_id?: string | null;
  image_url?: string | null;
  prices?: PriceVariant[];
}

function fmtPrice(p: PriceVariant): string {
  const amt = `$${Number(p.unit_amount).toFixed(2)}`;
  if (p.pricing_model === "one_time") return `${amt} one-time`;
  const interval = p.recurring_interval_count && p.recurring_interval_count > 1
    ? `every ${p.recurring_interval_count} ${p.recurring_interval}s`
    : `/${p.recurring_interval}`;
  return `${amt} ${interval}`;
}

export function OliverServiceCatalogPage() {
  const { get, post, patch, del, ready } = useOliverApi();
  const [categories, setCategories] = useState<Category[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("");
  const [search, setSearch] = useState("");

  const [editingOffering, setEditingOffering] = useState<Offering | null>(null);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"products" | "coupons" | "shipping">("products");

  async function syncFromStripe() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await post<{ products: { imported: number; updated: number }; customers: { imported: number }; subscriptions: { imported: number } }>(
        "/settings/stripe/import"
      );
      setSyncMessage(
        `Imported from Stripe: ${res.products.imported} new product${res.products.imported === 1 ? "" : "s"} ` +
        `(${res.products.updated} updated), ${res.customers.imported} new customer${res.customers.imported === 1 ? "" : "s"}, ` +
        `${res.subscriptions.imported} subscription${res.subscriptions.imported === 1 ? "" : "s"}.`
      );
      await reload();
    } catch (e) {
      setSyncMessage(`Sync failed: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  }

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, o] = await Promise.all([
        get<Category[]>("/catalog/categories"),
        get<Offering[]>("/catalog/offerings?include_prices=1"),
      ]);
      setCategories(c);
      setOfferings(o);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  const filteredOfferings = useMemo(() => {
    let list = offerings;
    if (activeCategoryId) {
      if (activeCategoryId === "__uncategorized__") list = list.filter((o) => !o.category_id);
      else list = list.filter((o) => o.category_id === activeCategoryId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(q) || o.description?.toLowerCase().includes(q));
    }
    return list;
  }, [offerings, activeCategoryId, search]);

  const pills = useMemo(() => {
    const all = { key: "", label: "All", count: offerings.length };
    const cats = categories.map((c) => ({
      key: c.category_id,
      label: c.name,
      count: offerings.filter((o) => o.category_id === c.category_id).length,
    }));
    const uncategorized = offerings.filter((o) => !o.category_id).length;
    return uncategorized > 0
      ? [all, ...cats, { key: "__uncategorized__", label: "Uncategorized", count: uncategorized }]
      : [all, ...cats];
  }, [offerings, categories]);

  function openNew() {
    setEditingOffering({
      offering_id: "",
      category_id: null,
      name: "",
      description: "",
      default_duration_minutes: null,
      is_active: true,
      is_self_bookable: false,
      requires_quote: false,
      prices: [],
    });
  }

  const columns: Column<Offering>[] = [
    {
      key: "name",
      header: "Service",
      sortable: true,
      sortAccessor: (o) => o.name.toLowerCase(),
      render: (o) => (
        <div>
          <div className="font-medium text-oliver-teal">{o.name}</div>
          {o.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">{o.description}</div>
          )}
        </div>
      ),
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      sortAccessor: (o) => o.category_name?.toLowerCase() ?? "",
      render: (o) => o.category_name
        ? (
          <span
            className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
            style={o.category_color ? { backgroundColor: `${o.category_color}1A`, color: o.category_color } : {}}
          >
            {o.category_name}
          </span>
        )
        : <span className="text-xs text-slate-400">—</span>,
    },
    {
      key: "duration",
      header: "Duration",
      align: "right",
      render: (o) => o.default_duration_minutes ? `${o.default_duration_minutes} min` : "—",
    },
    {
      key: "pricing",
      header: "Pricing",
      render: (o) => {
        const ps = o.prices ?? [];
        if (!ps.length) return <span className="text-xs text-amber-600">No prices</span>;
        const dflt = ps.find((p) => p.is_default) ?? ps[0];
        const more = ps.length > 1 ? <span className="text-xs text-slate-500"> · +{ps.length - 1} more</span> : null;
        return <span className="text-sm">{fmtPrice(dflt)}{more}</span>;
      },
    },
    {
      key: "flags",
      header: "Flags",
      render: (o) => (
        <div className="flex gap-1 flex-wrap">
          {o.is_self_bookable && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">Self-bookable</span>}
          {o.requires_quote && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 ring-1 ring-amber-200">Quote required</span>}
          {!o.stripe_product_id && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 ring-1 ring-slate-200">Stripe pending</span>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (o) => <StatusBadge status={o.is_active ? "active" : "inactive"} />,
    },
  ];

  return (
    <OliverPageWrapper title="Service Catalog" subtitle="Tenant-defined services" error={error} loading={loading}>
      <PageHeader
        title="Service Catalog"
        subtitle="What your business sells — services, products, subscriptions, coupons, shipping. Mirrors your Stripe account."
        actions={
          <>
            <Button variant="ghost" onClick={syncFromStripe} loading={syncing}>
              {syncing ? "Syncing…" : "Sync from Stripe"}
            </Button>
            {tab === "products" && (
              <>
                <Button variant="ghost" onClick={() => setShowCategoryManager(true)}>Manage categories</Button>
                <Button variant="primary" onClick={openNew}>+ Add service</Button>
              </>
            )}
          </>
        }
      />

      {/* Tabs across top of catalog */}
      <div className="ptabs" style={{ marginBottom: 16 }}>
        <button className={`ptab${tab === "products" ? " active" : ""}`} onClick={() => setTab("products")}>Products & Services</button>
        <button className={`ptab${tab === "coupons" ? " active" : ""}`} onClick={() => setTab("coupons")}>Coupons</button>
        <button className={`ptab${tab === "shipping" ? " active" : ""}`} onClick={() => setTab("shipping")}>Shipping rates</button>
      </div>

      {syncMessage && (
        <div className="info-card" style={{ marginBottom: 16 }}>
          <div className="info-body">{syncMessage}</div>
        </div>
      )}

      {tab === "coupons" && <CouponsTab api={{ get, post, del }} />}
      {tab === "shipping" && <ShippingRatesTab api={{ get, post }} />}

      {tab === "products" && (
      <>
      {!offerings.length ? (
        <EmptyState
          title="No services in your catalog yet"
          description="Click Sync from Stripe to pull in everything you've already set up there, or add a new service from scratch. Each service can have one-time or subscription pricing."
          action={
            <div className="flex gap-2 justify-center">
              <Button variant="ghost" onClick={syncFromStripe} loading={syncing}>Sync from Stripe</Button>
              <Button variant="primary" onClick={openNew}>+ Add service</Button>
            </div>
          }
        />
      ) : (
        <>
          <FilterBar
            pills={pills}
            activePill={activeCategoryId}
            onPillChange={setActiveCategoryId}
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search services…"
          />
          <DataTable
            rows={filteredOfferings}
            columns={columns}
            rowKey={(o) => o.offering_id}
            onRowClick={(o) => setEditingOffering(o)}
          />
        </>
      )}

      {editingOffering && (
        <OfferingDrawer
          offering={editingOffering}
          categories={categories}
          onClose={() => setEditingOffering(null)}
          onSaved={() => { setEditingOffering(null); reload(); }}
          api={{ post, patch, del }}
        />
      )}

      {showCategoryManager && (
        <CategoryManagerDrawer
          categories={categories}
          onClose={() => setShowCategoryManager(false)}
          onSaved={() => reload()}
          api={{ post, patch, del }}
        />
      )}
      </>
      )}
    </OliverPageWrapper>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Coupons tab
// ──────────────────────────────────────────────────────────────────────────────

interface Coupon {
  id: string;
  name?: string;
  percent_off?: number | null;
  amount_off?: number | null;
  currency?: string;
  duration: string;
  duration_in_months?: number | null;
  max_redemptions?: number | null;
  times_redeemed?: number;
  redeem_by?: number | null;
  valid?: boolean;
  created?: number;
}

function CouponsTab({ api }: { api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T>; del: <T>(p: string) => Promise<T> } }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setCoupons(await api.get<Coupon[]>("/catalog/coupons")); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function remove(c: Coupon) {
    if (!confirm(`Delete coupon ${c.name || c.id}?`)) return;
    try { await api.del(`/catalog/coupons/${c.id}`); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#5A7A8A" }}>{coupons.length} coupon{coupons.length === 1 ? "" : "s"}</div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>+ New coupon</Button>
      </div>
      {err && <div className="info-card" style={{ marginBottom: 12, background: "#FEE2E2", borderColor: "#FCA5A5" }}><div className="info-body" style={{ color: "#991B1B" }}>{err}</div></div>}
      {loading ? <div style={{ padding: 20, color: "#5A7A8A" }}>Loading…</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Discount</th><th>Duration</th><th>Redemptions</th><th>Expires</th><th></th>
            </tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name || c.id}</strong><div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{c.id}</div></td>
                  <td>{c.percent_off != null ? `${c.percent_off}% off` : c.amount_off != null ? `$${(c.amount_off / 100).toFixed(2)} off` : "—"}</td>
                  <td>{c.duration}{c.duration === "repeating" && c.duration_in_months ? ` (${c.duration_in_months}mo)` : ""}</td>
                  <td>{c.times_redeemed ?? 0}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}</td>
                  <td>{c.redeem_by ? new Date(c.redeem_by * 1000).toLocaleDateString() : "Never"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => remove(c)} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Delete</button>
                  </td>
                </tr>
              ))}
              {!coupons.length && <tr><td colSpan={6} style={{ textAlign: "center", padding: "30px 0", color: "#5A7A8A" }}>No coupons yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <NewCouponModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} api={{ post: api.post }} />}
    </div>
  );
}

function NewCouponModal({ onClose, onCreated, api }: { onClose: () => void; onCreated: () => void; api: { post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discount, setDiscount] = useState("");
  const [duration, setDuration] = useState<"once" | "forever" | "repeating">("once");
  const [months, setMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [redeemBy, setRedeemBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { name: name || undefined, duration };
      if (discountType === "percent") body.percentOff = Number(discount);
      else { body.amountOff = Number(discount); body.currency = "USD"; }
      if (duration === "repeating") body.durationInMonths = Number(months);
      if (maxRedemptions) body.maxRedemptions = Number(maxRedemptions);
      if (redeemBy) body.redeemBy = redeemBy;
      await api.post("/catalog/coupons", body);
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <DetailDrawer open onClose={onClose} title="New coupon" subtitle="Stripe coupon — applies to subscriptions or invoices" width="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create coupon</Button></>}
    >
      {err && <div className="info-card" style={{ marginBottom: 12, background: "#FEE2E2", borderColor: "#FCA5A5" }}><div className="info-body" style={{ color: "#991B1B" }}>{err}</div></div>}
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 12 }}>
          <strong>Name (optional)</strong>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spring Sale 10% off"
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 8, alignItems: "end" }}>
          <label style={{ fontSize: 12 }}>
            <strong>Discount type</strong>
            <select value={discountType} onChange={(e) => setDiscountType(e.target.value as never)}
              style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}>
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
          </label>
          <label style={{ fontSize: 12 }}>
            <strong>{discountType === "percent" ? "Percent" : "Amount (USD)"}</strong>
            <input type="number" min="0" step={discountType === "percent" ? "1" : "0.01"} value={discount} onChange={(e) => setDiscount(e.target.value)}
              style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
          </label>
        </div>
        <label style={{ fontSize: 12 }}>
          <strong>Applies for</strong>
          <select value={duration} onChange={(e) => setDuration(e.target.value as never)}
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }}>
            <option value="once">Once (first invoice only)</option>
            <option value="forever">Forever</option>
            <option value="repeating">Multiple months</option>
          </select>
        </label>
        {duration === "repeating" && (
          <label style={{ fontSize: 12 }}>
            <strong>Duration in months</strong>
            <input type="number" min="1" value={months} onChange={(e) => setMonths(e.target.value)}
              style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
          </label>
        )}
        <label style={{ fontSize: 12 }}>
          <strong>Max redemptions (optional)</strong>
          <input type="number" min="1" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)}
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          <strong>Redeem by (optional)</strong>
          <input type="date" value={redeemBy} onChange={(e) => setRedeemBy(e.target.value)}
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
        </label>
      </div>
    </DetailDrawer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shipping rates tab
// ──────────────────────────────────────────────────────────────────────────────

interface ShippingRate {
  id: string;
  display_name: string;
  fixed_amount?: { amount: number; currency: string };
  delivery_estimate?: { minimum?: { value: number; unit: string }; maximum?: { value: number; unit: string } };
  active: boolean;
}

function ShippingRatesTab({ api }: { api: { get: <T>(p: string) => Promise<T>; post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  const [rates, setRates] = useState<ShippingRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setRates(await api.get<ShippingRate[]>("/catalog/shipping-rates")); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [api]);
  useEffect(() => { load(); }, [load]);

  async function archive(r: ShippingRate) {
    if (!confirm(`Archive shipping rate ${r.display_name}?`)) return;
    try { await api.post(`/catalog/shipping-rates/${r.id}/archive`); await load(); }
    catch (e) { setErr((e as Error).message); }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "#5A7A8A" }}>{rates.length} active rate{rates.length === 1 ? "" : "s"}</div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>+ New shipping rate</Button>
      </div>
      {err && <div className="info-card" style={{ marginBottom: 12, background: "#FEE2E2", borderColor: "#FCA5A5" }}><div className="info-body" style={{ color: "#991B1B" }}>{err}</div></div>}
      {loading ? <div style={{ padding: 20, color: "#5A7A8A" }}>Loading…</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Cost</th><th>Delivery estimate</th><th></th>
            </tr></thead>
            <tbody>
              {rates.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.display_name}</strong><div style={{ fontSize: 10, color: "#5A7A8A", fontFamily: "monospace" }}>{r.id}</div></td>
                  <td>{r.fixed_amount ? `$${(r.fixed_amount.amount / 100).toFixed(2)} ${r.fixed_amount.currency.toUpperCase()}` : "—"}</td>
                  <td>{r.delivery_estimate?.minimum && r.delivery_estimate?.maximum
                    ? `${r.delivery_estimate.minimum.value}–${r.delivery_estimate.maximum.value} business days`
                    : "Not specified"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button onClick={() => archive(r)} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Archive</button>
                  </td>
                </tr>
              ))}
              {!rates.length && <tr><td colSpan={4} style={{ textAlign: "center", padding: "30px 0", color: "#5A7A8A" }}>No shipping rates yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && <NewShippingRateModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); load(); }} api={{ post: api.post }} />}
    </div>
  );
}

function NewShippingRateModal({ onClose, onCreated, api }: { onClose: () => void; onCreated: () => void; api: { post: <T>(p: string, b?: unknown) => Promise<T> } }) {
  const [displayName, setDisplayName] = useState("");
  const [amount, setAmount] = useState("");
  const [deliveryMin, setDeliveryMin] = useState("");
  const [deliveryMax, setDeliveryMax] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = { displayName, amount: Number(amount), currency: "USD" };
      if (deliveryMin && deliveryMax) {
        body.deliveryMin = Number(deliveryMin);
        body.deliveryMax = Number(deliveryMax);
      }
      await api.post("/catalog/shipping-rates", body);
      onCreated();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <DetailDrawer open onClose={onClose} title="New shipping rate" width="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Create rate</Button></>}
    >
      {err && <div className="info-card" style={{ marginBottom: 12, background: "#FEE2E2", borderColor: "#FCA5A5" }}><div className="info-body" style={{ color: "#991B1B" }}>{err}</div></div>}
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ fontSize: 12 }}>
          <strong>Display name</strong>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Standard Shipping"
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
        </label>
        <label style={{ fontSize: 12 }}>
          <strong>Amount (USD)</strong>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ fontSize: 12 }}>
            <strong>Delivery min (days)</strong>
            <input type="number" min="0" value={deliveryMin} onChange={(e) => setDeliveryMin(e.target.value)}
              style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
          </label>
          <label style={{ fontSize: 12 }}>
            <strong>Delivery max (days)</strong>
            <input type="number" min="0" value={deliveryMax} onChange={(e) => setDeliveryMax(e.target.value)}
              style={{ marginTop: 4, width: "100%", padding: "6px 10px", border: "1px solid #ddd", borderRadius: 4, fontSize: 12 }} />
          </label>
        </div>
      </div>
    </DetailDrawer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Offering drawer (create + edit + manage prices)
// ──────────────────────────────────────────────────────────────────────────────

interface OfferingDrawerProps {
  offering: Offering;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
  api: {
    post: <T>(path: string, body?: unknown) => Promise<T>;
    patch: <T>(path: string, body: unknown) => Promise<T>;
    del: <T>(path: string) => Promise<T>;
  };
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _OfferingDrawerHasArchive = OfferingDrawerProps;

/** A price the user is building (before the product exists in the API). */
interface DraftPrice {
  key: string;
  pricing_model: "one_time" | "recurring";
  unit_amount: number;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  trial_days?: number | null;
  label?: string | null;
  is_default?: boolean;
}

/** One-click billing cadences (Stripe parity, easier). "Custom" reveals raw interval+count. */
const PRICE_PRESETS: Array<{ id: string; label: string; model: "one_time" | "recurring"; interval?: string; count?: number }> = [
  { id: "one_time", label: "One-time", model: "one_time" },
  { id: "weekly", label: "Weekly", model: "recurring", interval: "week", count: 1 },
  { id: "biweekly", label: "Bi-weekly", model: "recurring", interval: "week", count: 2 },
  { id: "monthly", label: "Monthly", model: "recurring", interval: "month", count: 1 },
  { id: "quarterly", label: "Quarterly", model: "recurring", interval: "month", count: 3 },
  { id: "semiannual", label: "Every 6 months", model: "recurring", interval: "month", count: 6 },
  { id: "annual", label: "Annual", model: "recurring", interval: "year", count: 1 },
  { id: "custom", label: "Custom…", model: "recurring", interval: "month", count: 1 },
];

function draftPriceSummary(p: DraftPrice): string {
  const amt = `$${Number(p.unit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p.pricing_model === "one_time") return `${amt} one-time`;
  const n = p.recurring_interval_count && p.recurring_interval_count > 1 ? `every ${p.recurring_interval_count} ${p.recurring_interval}s` : `/${p.recurring_interval}`;
  return `${amt} ${n}`;
}

function OfferingDrawer({ offering, categories, onClose, onSaved, api }: OfferingDrawerProps) {
  const [draft, setDraft] = useState(offering);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAddPrice, setShowAddPrice] = useState(false);
  const [draftPrices, setDraftPrices] = useState<DraftPrice[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const isNew = !draft.offering_id;

  async function save() {
    setErr(null);
    if (!draft.name.trim()) { setErr("Name is required"); return; }
    setSaving(true);
    try {
      const body = {
        name: draft.name.trim(),
        description: draft.description ?? null,
        categoryId: draft.category_id || null,
        defaultDurationMinutes: draft.default_duration_minutes ?? null,
        isSelfBookable: draft.is_self_bookable,
        requiresQuote: draft.requires_quote,
        imageUrl: draft.image_url ?? null,
        isActive: draft.is_active,
      };
      if (isNew) {
        await api.post("/catalog/offerings", {
          ...body,
          prices: draftPrices.map((p) => ({
            pricingModel: p.pricing_model,
            unitAmount: p.unit_amount,
            recurringInterval: p.pricing_model === "recurring" ? p.recurring_interval : undefined,
            recurringIntervalCount: p.pricing_model === "recurring" ? p.recurring_interval_count : undefined,
            trialDays: p.trial_days ?? undefined,
            label: p.label || undefined,
            isDefault: !!p.is_default,
          })),
        });
      } else {
        await api.patch(`/catalog/offerings/${draft.offering_id}`, body);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function archiveOffering() {
    if (isNew) return;
    if (!confirm(`Archive "${draft.name}"? It will be hidden from your catalog and the Stripe Product will be deactivated. You can restore it later.`)) return;
    setSaving(true);
    try {
      await api.post(`/catalog/offerings/${draft.offering_id}/archive`);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteOffering() {
    if (isNew) return;
    if (!confirm(`Permanently DELETE "${draft.name}"? This removes it and all price variants from OLIVER. (The Stripe Product itself is not deleted.) This cannot be undone.`)) return;
    setSaving(true);
    try {
      await api.del(`/catalog/offerings/${draft.offering_id}`);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function addPrice(p: { pricingModel: "one_time" | "recurring"; unitAmount: number; recurringInterval?: string; recurringIntervalCount?: number; trialDays?: number; label?: string; isDefault?: boolean; }) {
    if (isNew) {
      // Buffer locally; created with the product in one call on Save.
      setDraftPrices((prev) => [
        ...(p.isDefault ? prev.map((x) => ({ ...x, is_default: false })) : prev),
        {
          key: crypto.randomUUID(),
          pricing_model: p.pricingModel,
          unit_amount: p.unitAmount,
          recurring_interval: p.recurringInterval ?? null,
          recurring_interval_count: p.recurringIntervalCount ?? null,
          trial_days: p.trialDays ?? null,
          label: p.label ?? null,
          is_default: !!p.isDefault || prev.length === 0,
        },
      ]);
      setShowAddPrice(false);
      return;
    }
    await api.post(`/catalog/offerings/${draft.offering_id}/prices`, p);
    setShowAddPrice(false);
    onSaved();
  }
  function removeDraftPrice(key: string) {
    setDraftPrices((prev) => prev.filter((x) => x.key !== key));
  }

  async function togglePriceDefault(price: PriceVariant) {
    await api.patch(`/catalog/prices/${price.price_id}`, { isDefault: !price.is_default });
    onSaved();
  }
  async function archivePrice(price: PriceVariant) {
    if (!confirm("Archive this price? Stripe Prices can't be deleted — this hides it from new sales.")) return;
    await api.patch(`/catalog/prices/${price.price_id}`, { isActive: false });
    onSaved();
  }

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={isNew ? "New product / service" : draft.name}
      subtitle={isNew ? "Name it, then add one or more prices (e.g. monthly + annual)" : "Edit details and pricing"}
      width="xl"
      footer={
        <>
          {!isNew && draft.is_active && (
            <Button variant="ghost" onClick={archiveOffering}>Archive</Button>
          )}
          {!isNew && !draft.is_active && (
            <Button variant="danger" onClick={deleteOffering}>Delete permanently</Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={save}>
            {isNew ? "Create product" : "Save changes"}
          </Button>
        </>
      }
    >
      {err && <div className="mb-4 rounded-lg bg-red-50 ring-1 ring-red-200 px-4 py-2 text-sm text-red-800">{err}</div>}

      <div className="space-y-5">
        <div className="space-y-4">
          <Field label="Product / service name" required>
            <input
              type="text" value={draft.name}
              placeholder="e.g. Website Maintenance Plan"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Description">
            <textarea
              rows={2} value={draft.description ?? ""}
              placeholder="Shown to customers on invoices, quotes and the portal."
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
          <Field label="Image URL (optional)">
            <input
              type="url" value={draft.image_url ?? ""}
              onChange={(e) => setDraft({ ...draft, image_url: e.target.value || null })}
              placeholder="https://…"
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
        </div>

        <div className="rounded-lg ring-1 ring-gray-200">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:text-oliver-teal">
            <span>Field-service & booking options (optional)</span>
            <span>{showAdvanced ? "▲" : "▼"}</span>
          </button>
          {showAdvanced && (
            <div className="px-3 pb-3 space-y-4 border-t border-gray-100 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Category">
                  <select
                    value={draft.category_id ?? ""}
                    onChange={(e) => setDraft({ ...draft, category_id: e.target.value || null })}
                    className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
                    <option value="">— Uncategorized —</option>
                    {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Default job duration (minutes)">
                  <input
                    type="number" min="0" step="5"
                    value={draft.default_duration_minutes ?? ""}
                    placeholder="Only for scheduled services"
                    onChange={(e) => setDraft({ ...draft, default_duration_minutes: e.target.value ? Number(e.target.value) : null })}
                    className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
                </Field>
              </div>
              <div className="flex flex-wrap gap-4">
                <Toggle label="Self-bookable by customers" checked={draft.is_self_bookable}
                  onChange={(v) => setDraft({ ...draft, is_self_bookable: v })} />
                <Toggle label="Requires quote first" checked={draft.requires_quote}
                  onChange={(v) => setDraft({ ...draft, requires_quote: v })} />
              </div>
            </div>
          )}
        </div>

        <div className="flex">
          <Toggle label="Active (available to sell)" checked={draft.is_active}
            onChange={(v) => setDraft({ ...draft, is_active: v })} />
        </div>

        <section className="pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-oliver-teal">Pricing</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Add as many prices as you want — e.g. a monthly <em>and</em> an annual rate.
                {isNew ? " They’re created in Stripe when you save." : " Stripe Prices are immutable — to change an amount, archive the old one and add a new one."}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setShowAddPrice(true)}>+ Add price</Button>
          </div>

          {isNew ? (
            draftPrices.length === 0 ? (
              <div className="text-sm text-slate-500 italic py-3">No prices yet — add at least one (e.g. Monthly, then Annual).</div>
            ) : (
              <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
                {draftPrices.map((p) => (
                  <div key={p.key} className="px-3 py-2 flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">
                        {draftPriceSummary(p)}
                        {p.label && <span className="ml-2 text-xs text-slate-500">({p.label})</span>}
                      </div>
                      {p.trial_days ? <div className="text-xs text-slate-500">{p.trial_days}-day trial</div> : null}
                    </div>
                    {p.is_default && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-oliver-gold-100 text-oliver-gold-700 ring-1 ring-oliver-gold-300">DEFAULT</span>}
                    <button onClick={() => removeDraftPrice(p.key)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                ))}
              </div>
            )
          ) : (draft.prices ?? []).length === 0 ? (
            <div className="text-sm text-slate-500 italic py-3">No price variants yet — add one to enable selling this service.</div>
          ) : (
            <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
              {(draft.prices ?? []).map((p) => (
                <div key={p.price_id} className={`px-3 py-2 flex items-center gap-3 ${!p.is_active ? "opacity-50" : ""}`}>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-slate-800">
                      {fmtPrice(p)}
                      {p.label && <span className="ml-2 text-xs text-slate-500">({p.label})</span>}
                    </div>
                    {p.trial_days ? <div className="text-xs text-slate-500">{p.trial_days}-day trial</div> : null}
                  </div>
                  {p.is_default && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-oliver-gold-100 text-oliver-gold-700 ring-1 ring-oliver-gold-300">DEFAULT</span>}
                  {p.stripe_price_id && <span className="text-[10px] font-mono text-slate-400">{p.stripe_price_id}</span>}
                  {!p.is_default && p.is_active && (
                    <button onClick={() => togglePriceDefault(p)} className="text-xs text-slate-500 hover:text-oliver-teal">Make default</button>
                  )}
                  {p.is_active && (
                    <button onClick={() => archivePrice(p)} className="text-xs text-red-500 hover:text-red-700">Archive</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddPrice && (
            <AddPriceForm onSubmit={addPrice} onCancel={() => setShowAddPrice(false)} />
          )}
        </section>
      </div>
    </DetailDrawer>
  );
}

function AddPriceForm({ onSubmit, onCancel }: { onSubmit: (p: { pricingModel: "one_time" | "recurring"; unitAmount: number; recurringInterval?: string; recurringIntervalCount?: number; trialDays?: number; label?: string; isDefault?: boolean; }) => void; onCancel: () => void; }) {
  const [presetId, setPresetId] = useState<string>("monthly");
  const [amount, setAmount] = useState("");
  const [interval, setInterval] = useState<"day" | "week" | "month" | "year">("month");
  const [intervalCount, setIntervalCount] = useState("1");
  const [trial, setTrial] = useState("");
  const [label, setLabel] = useState("");
  const [setDefault, setSetDefault] = useState(false);

  const preset = PRICE_PRESETS.find((p) => p.id === presetId) ?? PRICE_PRESETS[3];
  const isCustom = presetId === "custom";
  const isRecurring = preset.model === "recurring";

  function submit() {
    const amt = Number(amount);
    if (!(amt >= 0) || amount === "") return;
    onSubmit({
      pricingModel: preset.model,
      unitAmount: amt,
      recurringInterval: isRecurring ? (isCustom ? interval : preset.interval) : undefined,
      recurringIntervalCount: isRecurring ? (isCustom ? Number(intervalCount) || 1 : preset.count) : undefined,
      trialDays: isRecurring && trial ? Number(trial) : undefined,
      label: label || undefined,
      isDefault: setDefault,
    });
  }

  return (
    <div className="mt-3 rounded-lg ring-1 ring-oliver-gold-300 bg-oliver-gold-50 p-4 space-y-3">
      <div>
        <div className="text-xs font-medium text-slate-600 mb-1.5">Billing cadence</div>
        <div className="flex flex-wrap gap-1.5">
          {PRICE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPresetId(p.id)}
              className={`px-3 py-1 text-xs rounded-full font-medium ${presetId === p.id ? "bg-oliver-teal text-white" : "bg-white text-slate-600 ring-1 ring-gray-300 hover:ring-oliver-teal"}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount (USD)" required>
          <input type="number" min="0" step="0.01" value={amount} autoFocus
            onChange={(e) => setAmount(e.target.value)}
            className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
        </Field>
        <Field label="Label (optional)">
          <input type="text" value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Pro plan" className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
        </Field>
        {isCustom && (
          <>
            <Field label="Interval">
              <select value={interval} onChange={(e) => setInterval(e.target.value as never)}
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm">
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </Field>
            <Field label="Every N intervals">
              <input type="number" min="1" value={intervalCount}
                onChange={(e) => setIntervalCount(e.target.value)}
                className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
            </Field>
          </>
        )}
        {isRecurring && (
          <Field label="Free trial days (optional)">
            <input type="number" min="0" value={trial}
              onChange={(e) => setTrial(e.target.value)}
              className="block w-full rounded-lg ring-1 ring-gray-300 px-3 py-2 text-sm" />
          </Field>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={setDefault} onChange={(e) => setSetDefault(e.target.checked)} />
        Set as the default price for this product
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" variant="primary" onClick={submit}>Add price</Button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Category manager
// ──────────────────────────────────────────────────────────────────────────────

function CategoryManagerDrawer({ categories, onClose, onSaved, api }: { categories: Category[]; onClose: () => void; onSaved: () => void; api: { post: <T>(p: string, b?: unknown) => Promise<T>; patch: <T>(p: string, b: unknown) => Promise<T>; del: <T>(p: string) => Promise<T>; }; }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#1A3A4A");

  async function add() {
    if (!newName.trim()) return;
    await api.post("/catalog/categories", { name: newName.trim(), color: newColor });
    setNewName("");
    onSaved();
  }
  async function rename(c: Category, name: string) {
    await api.patch(`/catalog/categories/${c.category_id}`, { name });
    onSaved();
  }
  async function recolor(c: Category, color: string) {
    await api.patch(`/catalog/categories/${c.category_id}`, { color });
    onSaved();
  }
  async function remove(c: Category) {
    if (!confirm(`Delete category "${c.name}"? Offerings in this category will become uncategorized.`)) return;
    await api.del(`/catalog/categories/${c.category_id}`);
    onSaved();
  }

  return (
    <DetailDrawer open onClose={onClose} title="Manage categories" subtitle="Group your services for easier browsing" width="lg">
      <div className="space-y-5">
        <div className="rounded-lg ring-1 ring-gray-200 divide-y divide-gray-100">
          {categories.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-slate-500 italic">No categories yet — add one below.</div>
          )}
          {categories.map((c) => (
            <div key={c.category_id} className="px-3 py-2 flex items-center gap-2">
              <input type="color" value={c.color || "#1A3A4A"}
                onChange={(e) => recolor(c, e.target.value)}
                className="h-8 w-10 rounded ring-1 ring-gray-300 flex-shrink-0"
                title="Category color" />
              <input type="text" defaultValue={c.name}
                onBlur={(e) => { if (e.target.value !== c.name) rename(c, e.target.value); }}
                className="flex-1 min-w-0 rounded ring-1 ring-gray-300 px-2 py-1 text-sm" />
              <button onClick={() => remove(c)} className="text-xs text-red-500 hover:text-red-700 flex-shrink-0 px-2">Delete</button>
            </div>
          ))}
        </div>

        <div className="rounded-lg bg-oliver-gold-50 ring-1 ring-oliver-gold-300 p-4 space-y-3">
          <div className="text-xs font-medium uppercase tracking-wide text-oliver-teal">Add a category</div>
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-12 rounded ring-1 ring-gray-300 flex-shrink-0" title="Pick color" />
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Cleaning, Tax Prep, Logo Design, Coffee Beans…"
              onKeyDown={(e) => e.key === "Enter" && add()}
              className="flex-1 min-w-[200px] rounded ring-1 ring-gray-300 px-3 py-2 text-sm" />
            <Button variant="primary" onClick={add} disabled={!newName.trim()}>Add category</Button>
          </div>
          <p className="text-xs text-slate-600">Categories help you organize services. You can also leave services uncategorized.</p>
        </div>
      </div>
    </DetailDrawer>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Tiny form helpers
// ──────────────────────────────────────────────────────────────────────────────

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${full ? "col-span-2" : ""}`}>
      <span className="text-slate-700 font-medium">
        {label}{required && <span className="text-red-500 ml-1">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="rounded text-oliver-teal focus:ring-oliver-gold" />
      {label}
    </label>
  );
}
