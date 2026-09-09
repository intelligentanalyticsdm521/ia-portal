import { useCallback, useEffect, useMemo, useState } from "react";
import { useOliverApi } from "../../hooks/useOliverApi";
import { OliverPageWrapper } from "../../components/OliverPageWrapper";
import { ReportBar } from '../../components/insights/ReportBar';
import { useProductInsightsPayload } from '../../hooks/useProductInsightsPayload';
import {
  PageHeader, DataTable, EmptyState, Button, type Column,
} from "../../components/oliver/ui";

interface Coupon {
  coupon_id: string;
  code: string;
  name: string | null;
  discount_type: "percent" | "amount";
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  duration: "once" | "forever" | "repeating";
  duration_in_months: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
  valid_from: string | null;
  valid_until: string | null;
  stripe_coupon_id: string | null;
  stripe_promotion_code_id: string | null;
  is_active: boolean;
  created_at: string;
  total_discounted: number;
}

function fmtMoney(n: number) {
  return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function discountLabel(c: Coupon): string {
  if (c.discount_type === "percent") return `${Number(c.percent_off).toFixed(0)}% off`;
  return `${fmtMoney(Number(c.amount_off))} off`;
}

function durationLabel(c: Coupon): string {
  if (c.duration === "forever") return "Forever";
  if (c.duration === "repeating") return `${c.duration_in_months} mo`;
  return "Once";
}

export function OliverCouponsPage() {
  const insightsPayload = useProductInsightsPayload('oliver').payload;
  const { get, post, patch, del, ready } = useOliverApi();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await get<Coupon[]>("/coupons");
      setCoupons(data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [get]);

  useEffect(() => { if (ready) reload(); }, [ready, reload]);

  async function toggleActive(c: Coupon) {
    setSavingId(c.coupon_id);
    try {
      await patch(`/coupons/${c.coupon_id}`, { is_active: !c.is_active });
      setCoupons((prev) => prev.map((p) => (p.coupon_id === c.coupon_id ? { ...p, is_active: !p.is_active } : p)));
      setFlash(c.is_active ? "Coupon deactivated." : "Coupon reactivated.");
      setTimeout(() => setFlash(null), 2500);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCoupon(c: Coupon) {
    if (!confirm(`Delete coupon "${c.code}"? It can still be seen in historical redemptions, but new uses will be blocked.`)) return;
    setSavingId(c.coupon_id);
    try {
      await del(`/coupons/${c.coupon_id}`);
      // Soft delete just flips is_active in the API response, so refetch to show it as inactive
      await reload();
      setFlash(`Coupon "${c.code}" deactivated.`);
      setTimeout(() => setFlash(null), 2500);
    } catch (err) {
      setError(err);
    } finally {
      setSavingId(null);
    }
  }

  // Summary KPIs — visualize aggregate so the page isn't just a list
  const summary = useMemo(() => {
    const active = coupons.filter((c) => c.is_active);
    const totalSaved = coupons.reduce((s, c) => s + Number(c.total_discounted || 0), 0);
    const totalRedemptions = coupons.reduce((s, c) => s + Number(c.times_redeemed || 0), 0);
    return { active: active.length, total: coupons.length, totalSaved, totalRedemptions };
  }, [coupons]);

  const columns: Column<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      sortable: true,
      sortAccessor: (c) => c.code,
      render: (c) => (
        <div>
          <div style={{ fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace", fontWeight: 700, color: "#1A3A4A", letterSpacing: 0.5 }}>{c.code}</div>
          {c.name && <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{c.name}</div>}
        </div>
      ),
    },
    {
      key: "discount",
      header: "Discount",
      render: (c) => (
        <div>
          <div style={{ fontWeight: 600, color: "#0B1C24" }}>{discountLabel(c)}</div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{durationLabel(c)}</div>
        </div>
      ),
    },
    {
      key: "usage",
      header: "Redemptions",
      render: (c) => (
        <div>
          <div style={{ color: "#0B1C24" }}>
            {c.times_redeemed}{c.max_redemptions ? ` / ${c.max_redemptions}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{fmtMoney(c.total_discounted)} saved</div>
        </div>
      ),
    },
    {
      key: "validity",
      header: "Valid",
      render: (c) => (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: "#0B1C24" }}>{fmtDate(c.valid_from)} → {fmtDate(c.valid_until)}</div>
        </div>
      ),
    },
    {
      key: "stripe",
      header: "Stripe",
      render: (c) => (
        c.stripe_promotion_code_id
          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#D1FAE5", color: "#047857", fontWeight: 600 }}>Synced</span>
          : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#FEF3C7", color: "#92400E", fontWeight: 600 }}>Local only</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        c.is_active
          ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#D1FAE5", color: "#047857", fontWeight: 600 }}>Active</span>
          : <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: "#F1F5F9", color: "#5A7A8A", fontWeight: 600 }}>Inactive</span>
      ),
    },
    {
      key: "actions",
      header: "",
      width: "190px",
      align: "right",
      render: (c) => (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Button variant="ghost" onClick={() => toggleActive(c)} disabled={savingId === c.coupon_id}>
            {c.is_active ? "Deactivate" : "Reactivate"}
          </Button>
          <Button variant="ghost" onClick={() => deleteCoupon(c)} disabled={savingId === c.coupon_id}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <OliverPageWrapper title="Coupons" subtitle="Discount codes synced with Stripe" error={error} loading={loading && !coupons.length}>
      <ReportBar product="oliver" detail={insightsPayload?.detail} reports={[
        { id: 'oliver_coupons', label: 'Discount usage' },
      ]} />
      <PageHeader
        title="Coupons"
        subtitle="Create discount codes that customers can apply at checkout. Synced bidirectionally with Stripe Promotion Codes."
        actions={
          <Button variant="primary" onClick={() => setShowCreate(true)}>+ New coupon</Button>
        }
      />

      {flash && (
        <div style={{ padding: 10, margin: "0 0 12px", fontSize: 12, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0", borderRadius: 6 }}>
          {flash}
        </div>
      )}

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat-card">
          <div className="stat-lbl">Active coupons</div>
          <div className="stat-val" style={{ color: "#1A3A4A" }}>{summary.active}</div>
          <div className="stat-delta neu">of {summary.total} total</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Total redemptions</div>
          <div className="stat-val" style={{ color: "#1A3A4A" }}>{summary.totalRedemptions}</div>
          <div className="stat-delta neu">across all coupons</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Customer savings</div>
          <div className="stat-val" style={{ color: "#059669" }}>{fmtMoney(summary.totalSaved)}</div>
          <div className="stat-delta neu">all-time discounts</div>
        </div>
      </div>

      {coupons.length === 0 && !loading ? (
        <EmptyState
          title="No coupons yet"
          description="Create your first discount code to use on invoices and quotes — automatically synced with Stripe so customers can also enter it at hosted checkout."
          action={<Button variant="primary" onClick={() => setShowCreate(true)}>+ New coupon</Button>}
        />
      ) : (
        <DataTable
          rows={coupons}
          columns={columns}
          rowKey={(c) => c.coupon_id}
          initialSort={{ key: "code", direction: "asc" }}
        />
      )}

      {showCreate && (
        <CreateCouponDrawer
          onClose={() => setShowCreate(false)}
          onCreated={async (msg) => {
            setShowCreate(false);
            await reload();
            setFlash(msg);
            setTimeout(() => setFlash(null), 3000);
          }}
          post={post}
        />
      )}
    </OliverPageWrapper>
  );
}

// ─── Create drawer ─────────────────────────────────────────────────────────
function CreateCouponDrawer({
  onClose, onCreated, post,
}: {
  onClose: () => void;
  onCreated: (msg: string) => void;
  post: <T>(path: string, body?: unknown) => Promise<T>;
}) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [percentOff, setPercentOff] = useState("10");
  const [amountOff, setAmountOff] = useState("25");
  const [duration, setDuration] = useState<"once" | "forever" | "repeating">("once");
  const [durationMonths, setDurationMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!code.trim()) { setErr("Code is required"); return; }
    setErr(null);
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: code.trim().toUpperCase(),
        name: name.trim() || null,
        discount_type: discountType,
        duration,
      };
      if (discountType === "percent") payload.percent_off = Number(percentOff);
      else { payload.amount_off = Number(amountOff); payload.currency = "USD"; }
      if (duration === "repeating") payload.duration_in_months = Number(durationMonths);
      if (maxRedemptions) payload.max_redemptions = Number(maxRedemptions);
      if (validUntil) payload.valid_until = new Date(validUntil).toISOString();

      const res = await post<{ code: string; stripe_synced: boolean; sync_error: string | null }>("/coupons", payload);
      onCreated(
        res.stripe_synced
          ? `Created coupon "${res.code}" and synced with Stripe.`
          : `Created coupon "${res.code}" locally${res.sync_error ? ` (Stripe sync failed: ${res.sync_error})` : ""}.`,
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create coupon");
    } finally {
      setSaving(false);
    }
  }

  // Preview the actual discount
  const samplePreview = useMemo(() => {
    const sub = 200;
    if (discountType === "percent") {
      const p = Math.max(0, Math.min(100, Number(percentOff) || 0));
      return { off: (sub * p) / 100, label: `${p}% off $${sub}` };
    }
    const a = Math.max(0, Number(amountOff) || 0);
    return { off: Math.min(a, sub), label: `$${a.toFixed(2)} off $${sub}` };
  }, [discountType, percentOff, amountOff]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,28,36,0.4)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}>
      <div style={{ width: 480, height: "100%", background: "#fff", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }}>
        <div style={{ padding: 20, borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1A3A4A" }}>New coupon</h2>
          <button onClick={onClose} style={{ background: "transparent", border: 0, fontSize: 22, color: "#5A7A8A", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ padding: 20, display: "grid", gap: 14 }}>
          <Field label="Code">
            <input
              type="text" style={inputStyle}
              placeholder="WELCOME10"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 4 }}>
              Customer-facing string they enter to redeem. Uppercased automatically.
            </div>
          </Field>

          <Field label="Name (internal)">
            <input
              type="text" style={inputStyle}
              placeholder="Welcome offer"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <Field label="Discount type">
            <div style={{ display: "flex", gap: 8 }}>
              {(["percent", "amount"] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => setDiscountType(t)}
                  style={{
                    flex: 1, padding: "8px 12px", fontSize: 13, fontWeight: 600,
                    borderRadius: 6,
                    border: discountType === t ? "1px solid #1A3A4A" : "1px solid #D5E2E8",
                    background: discountType === t ? "#1A3A4A" : "#fff",
                    color: discountType === t ? "#fff" : "#1A3A4A",
                    cursor: "pointer",
                  }}>
                  {t === "percent" ? "Percentage" : "Fixed amount"}
                </button>
              ))}
            </div>
          </Field>

          {discountType === "percent" ? (
            <Field label="Percent off">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="number" min="1" max="100" step="1" style={{ ...inputStyle, width: 100 }}
                  value={percentOff} onChange={(e) => setPercentOff(e.target.value)} />
                <span style={{ color: "#5A7A8A" }}>%</span>
              </div>
            </Field>
          ) : (
            <Field label="Amount off (USD)">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "#5A7A8A" }}>$</span>
                <input type="number" min="0.01" step="0.01" style={{ ...inputStyle, width: 140 }}
                  value={amountOff} onChange={(e) => setAmountOff(e.target.value)} />
              </div>
            </Field>
          )}

          <Field label="Applies">
            <select style={inputStyle} value={duration} onChange={(e) => setDuration(e.target.value as "once" | "forever" | "repeating")}>
              <option value="once">Once (single invoice)</option>
              <option value="forever">Forever (subscriptions)</option>
              <option value="repeating">Repeating (subscriptions for N months)</option>
            </select>
          </Field>

          {duration === "repeating" && (
            <Field label="Months">
              <input type="number" min="1" max="36" style={{ ...inputStyle, width: 100 }}
                value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} />
            </Field>
          )}

          <Field label="Max redemptions (optional)">
            <input type="number" min="1" style={inputStyle}
              placeholder="Leave blank for unlimited"
              value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} />
          </Field>

          <Field label="Expires (optional)">
            <input type="date" style={inputStyle}
              value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>

          {/* Sample preview */}
          <div style={{
            padding: 12, background: "#F0F9FF",
            border: "1px solid #BAE6FD", borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#075985", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Preview
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: "#0B1C24" }}>
              On a $200 subtotal: <strong style={{ color: "#059669" }}>{samplePreview.label}</strong> = ${(200 - samplePreview.off).toFixed(2)}
            </div>
          </div>

          {err && (
            <div style={{ padding: 10, fontSize: 12, background: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA", borderRadius: 6 }}>
              {err}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} disabled={saving || !code.trim()}>
              {saving ? "Creating…" : "Create coupon"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}
