/**
 * SubscriptionDetailPanel — body of the deprecated standalone SubscriptionModal,
 * extracted to render inside the unified CustomerModal's Subscriptions section.
 *
 * Same content as the old modal (status header, action bar with
 * pause/resume/skip/cancel, line items, recurring-job linkage, cycle
 * history). Drawer chrome is owned by the parent CustomerModal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "../ui";

interface SubItem {
  item_id: string;
  product_name: string;
  unit_amount: number;
  quantity: number;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  /** Backend returns this — needed for PATCH /subscriptions/:id item edits. */
  stripe_subscription_item_id?: string | null;
  /** Used by the "Add line item" picker to detect duplicates and bump qty instead. */
  stripe_price_id?: string | null;
}
interface SubscriptionDetail {
  subscription_id: string;
  service_name?: string;
  status: string;
  amount: number;
  netAmount?: number | null;
  currency: string;
  billing_interval: string;
  billing_interval_count?: number;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  coupon_name?: string | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  contact_id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  stripe_subscription_id?: string;
  items?: SubItem[];
}
interface CycleJob {
  id: string;
  title: string;
  status: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  total: number;
  createdAt: string;
}
interface CycleInvoice {
  id: string;
  number?: string | null;
  total: number;
  amountPaid?: number | null;
  status: string;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt: string;
}
interface RecurringTemplate {
  id: string;
  title: string;
  recurrenceInterval: string;
  subscriptionId?: string | null;
}

function fmtMoney(n?: number | null) {
  return `$${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) { return d ? new Date(d).toLocaleDateString() : "—"; }
function fmtDateTime(d?: string | null) { return d ? new Date(d).toLocaleString() : "—"; }

const actionLabels: Record<string, { label: string; toast: string }> = {
  pause: { label: "Pause", toast: "Subscription paused" },
  resume: { label: "Resume", toast: "Subscription resumed" },
  "skip-cycle": { label: "Skip cycle", toast: "Next cycle skipped" },
  reschedule: { label: "Reschedule", toast: "Next billing date updated" },
  cancel: { label: "Cancel", toast: "Cancels at end of period" },
};

export interface SubscriptionDetailPanelProps {
  subscriptionId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
    /** F-16 — used by line items edit mode to PATCH /subscriptions/:id */
    patch: <T>(p: string, b: unknown) => Promise<T>;
  };
  onChanged?: () => void;
  topSlot?: React.ReactNode;
}

export function SubscriptionDetailPanel({ subscriptionId, api, onChanged, topSlot }: SubscriptionDetailPanelProps) {
  const [sub, setSub] = useState<SubscriptionDetail | null>(null);
  const [cycles, setCycles] = useState<{ jobs: CycleJob[]; invoices: CycleInvoice[] }>({ jobs: [], invoices: [] });
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [linkTemplateId, setLinkTemplateId] = useState<string>("");
  // F-16 — line item edit mode. Lets the admin change quantities (and
  // remove items) per-subscription via PATCH /subscriptions/:id, which
  // updates Stripe + re-syncs the local mirror.
  const [editingItems, setEditingItems] = useState(false);
  const [draftItems, setDraftItems] = useState<Record<string, { quantity: number; unitAmount: string; deleted: boolean }>>({});
  const [savingItems, setSavingItems] = useState(false);
  // Items added during edit mode that don't exist on the subscription yet.
  // Each carries a temp id (for React keying), the chosen catalog price
  // (price_id is what the backend forwards to Stripe subscriptions.update —
  // see oliver-api subscriptions.js:739-743), and the resolved display fields.
  interface NewItemDraft {
    tempId: string;
    price_id: string;
    product_name: string;
    unit_amount: number;
    recurring_interval?: string | null;
    recurring_interval_count?: number | null;
    quantity: number;
  }
  const [newItems, setNewItems] = useState<NewItemDraft[]>([]);
  // Catalog cache + picker open state for the "+ Add line item" affordance.
  interface CatalogPrice {
    price_id: string;
    unit_amount: number;
    label?: string | null;
    pricing_model?: string | null;
    recurring_interval?: string | null;
    recurring_interval_count?: number | null;
  }
  interface CatalogOffering {
    offering_id: string;
    name: string;
    description?: string | null;
    prices?: CatalogPrice[];
  }
  const [catalog, setCatalog] = useState<CatalogOffering[]>([]);
  const [catalogLoaded, setCatalogLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  // Bug #35 — Reschedule next billing date. Opens an inline date picker
  // when the admin clicks "Reschedule"; submit posts to the new
  // /subscriptions/:id/reschedule endpoint which syncs to Stripe.
  const [reschedOpen, setReschedOpen] = useState(false);
  const [reschedDate, setReschedDate] = useState<string>("");

  const reload = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [s, c, t] = await Promise.all([
        api.get<{ data: SubscriptionDetail } | SubscriptionDetail>(`/subscriptions/${subscriptionId}`),
        api.get<{ data: { jobs: CycleJob[]; invoices: CycleInvoice[] } }>(`/subscriptions/${subscriptionId}/cycles`)
          .catch(() => ({ data: { jobs: [], invoices: [] } })),
        api.get<{ data: RecurringTemplate[] } | RecurringTemplate[]>(`/recurring-jobs`).catch(() => ({ data: [] })),
      ]);
      setSub((s as any)?.data ?? s);
      setCycles((c as any)?.data ?? { jobs: [], invoices: [] });
      setTemplates(Array.isArray(t) ? t : ((t as any)?.data ?? []));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [api, subscriptionId]);

  useEffect(() => { reload(); }, [reload]);

  // Lazy-load the catalog the first time the user opens the "+ Add line item"
  // picker. Recurring prices only — one-time prices can't be attached to a
  // subscription line item (Stripe rejects them).
  useEffect(() => {
    if (!pickerOpen || catalogLoaded) return;
    (async () => {
      try {
        const data = await api.get<{ data: CatalogOffering[] } | CatalogOffering[]>("/catalog/offerings?include_prices=1");
        const list = Array.isArray(data) ? data : ((data as { data?: CatalogOffering[] }).data ?? []);
        setCatalog(list);
      } catch {
        setCatalog([]);
      } finally {
        setCatalogLoaded(true);
      }
    })();
  }, [pickerOpen, catalogLoaded, api]);

  // Catalog rows flattened to (offering, price) pairs, recurring only, with a
  // search filter applied. Stable order: offering name asc, then price label.
  const catalogChoices = useMemo(() => {
    const rows: Array<{ offering: CatalogOffering; price: CatalogPrice; key: string }> = [];
    for (const off of catalog) {
      for (const p of off.prices || []) {
        if (!p.recurring_interval) continue;
        rows.push({ offering: off, price: p, key: `${off.offering_id}:${p.price_id}` });
      }
    }
    const q = pickerSearch.trim().toLowerCase();
    const filtered = q
      ? rows.filter(r => r.offering.name.toLowerCase().includes(q) || (r.price.label || "").toLowerCase().includes(q))
      : rows;
    return filtered.sort((a, b) => a.offering.name.localeCompare(b.offering.name) || (a.price.label || "").localeCompare(b.price.label || ""));
  }, [catalog, pickerSearch]);

  async function doAction(action: string, opts?: { confirm?: string; body?: unknown }) {
    if (opts?.confirm && !confirm(opts.confirm)) return;
    setBusy(action); setErr(null); setToast(null);
    try {
      await api.post(`/subscriptions/${subscriptionId}/${action}`, opts?.body || {});
      setToast(actionLabels[action]?.toast || "Done");
      await reload();
      onChanged?.();
    } catch (e) { setErr(`${actionLabels[action]?.label || action} failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  async function linkTemplate() {
    if (!linkTemplateId) return;
    setBusy("link"); setErr(null);
    try {
      await api.post(`/subscriptions/${subscriptionId}/link-recurring-job`, {
        recurring_job_template_id: linkTemplateId,
      });
      setLinkPickerOpen(false); setLinkTemplateId("");
      setToast("Linked — next cycle will auto-create a job");
      await reload();
      onChanged?.();
    } catch (e) { setErr(`Link failed: ${(e as Error).message}`); }
    finally { setBusy(null); }
  }

  const linkedTemplate = useMemo(() => templates.find((t) => t.subscriptionId === subscriptionId), [templates, subscriptionId]);
  const unlinkedTemplates = useMemo(() => templates.filter((t) => !t.subscriptionId || t.subscriptionId === subscriptionId), [templates, subscriptionId]);

  if (loading || !sub) {
    return <div>{topSlot}<div style={{ color: "#5A7A8A", padding: 20 }}>Loading subscription…</div></div>;
  }

  const isPaused = sub.status === "paused";
  const isCanceled = sub.status === "canceled";
  const isCancelingSoon = !!sub.cancel_at_period_end && sub.status === "active";

  return (
    <div>
      {topSlot}

      {/* Header summary */}
      <div className="card" style={{ background: isPaused ? "#FEF3C7" : "#F8FAFC", borderLeft: `4px solid ${isPaused ? "#D97706" : isCanceled ? "#94A3B8" : "#1A7DB5"}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, color: "#5A7A8A", textTransform: "uppercase", letterSpacing: 0.5 }}>Subscription</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0B1C24", marginTop: 2 }}>{sub.service_name || "(unnamed)"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <StatusBadge status={sub.status} />
              {isCancelingSoon && <span style={{ fontSize: 11, color: "#9333EA", fontWeight: 600 }}>ⓘ Cancels at end of period</span>}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#0B1C24" }}>
              {sub.current_period_end ? <>Next charge: <strong>{fmtDate(sub.current_period_end)}</strong></> : "No upcoming charge"}
            </div>
            {sub.coupon_name && (
              <div style={{ fontSize: 11, color: "#9333EA", marginTop: 2 }}>
                Discount: {sub.coupon_name}
                {sub.discount_percent ? ` (${sub.discount_percent}% off)` : sub.discount_amount ? ` ($${sub.discount_amount} off)` : ""}
              </div>
            )}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0B1C24", fontFamily: "monospace" }}>{fmtMoney(sub.netAmount ?? sub.amount)}</div>
            <div style={{ fontSize: 11, color: "#5A7A8A" }}>
              per {sub.billing_interval_count && sub.billing_interval_count > 1 ? `${sub.billing_interval_count} ${sub.billing_interval}s` : sub.billing_interval}
            </div>
          </div>
        </div>
      </div>

      {err && <div style={{ marginBottom: 12, background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{err}</div>}
      {toast && <div style={{ marginBottom: 12, background: "#DCFCE7", border: "1px solid #BBF7D0", color: "#166534", borderRadius: 6, padding: "8px 12px", fontSize: 12 }}>{toast}</div>}

      {/* Actions */}
      <div className="card">
        <div className="card-ttl">Subscription actions</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>All actions sync to Stripe immediately — no need to open the Stripe Dashboard.</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {!isPaused && !isCanceled && (
            <Button variant="secondary" disabled={busy === "pause"}
              onClick={() => doAction("pause", { confirm: "Pause auto-collection? Stripe will stop charging until you resume. The subscription stays active and no jobs auto-create during the pause." })}>
              {busy === "pause" ? "Pausing…" : "Pause"}
            </Button>
          )}
          {isPaused && (
            <Button variant="primary" disabled={busy === "resume"}
              onClick={() => doAction("resume", { confirm: "Resume auto-collection? Stripe will charge at the next cycle." })}>
              {busy === "resume" ? "Resuming…" : "Resume"}
            </Button>
          )}
          {!isCanceled && (
            <Button variant="secondary" disabled={busy === "skip-cycle"}
              onClick={() => doAction("skip-cycle", { confirm: `Skip the next cycle? Billing moves from ${fmtDate(sub.current_period_end)} to one interval later.` })}>
              {busy === "skip-cycle" ? "Skipping…" : "Skip next cycle"}
            </Button>
          )}
          {/* Bug #35 — Reschedule next billing date. Inline picker so the
              admin can pick any future date instead of stepping by one
              cycle at a time with "Skip". Calls POST /subscriptions/:id/
              reschedule which uses Stripe trial_end + proration_behavior:
              "none" — no pro-rating, the new date becomes the anchor. */}
          {!isCanceled && (
            <Button variant="secondary" disabled={busy === "reschedule"}
              onClick={() => {
                // Default to current period end + 7 days so the picker
                // starts somewhere sensible.
                const seed = new Date(sub.current_period_end || Date.now());
                seed.setDate(seed.getDate() + 7);
                // datetime-local needs "YYYY-MM-DDTHH:MM" with no Z.
                const pad = (n: number) => String(n).padStart(2, "0");
                setReschedDate(
                  `${seed.getFullYear()}-${pad(seed.getMonth() + 1)}-${pad(seed.getDate())}T${pad(seed.getHours())}:${pad(seed.getMinutes())}`,
                );
                setReschedOpen((v) => !v);
              }}>
              {reschedOpen ? "Cancel reschedule" : "Reschedule next billing"}
            </Button>
          )}
          {!isCanceled && !isCancelingSoon && (
            <Button variant="danger" disabled={busy === "cancel"}
              onClick={() => doAction("cancel", { confirm: `Cancel at end of period? Access continues until ${fmtDate(sub.current_period_end)}.`, body: { at_period_end: true } })}>
              {busy === "cancel" ? "Canceling…" : "Cancel at period end"}
            </Button>
          )}
        </div>
        {reschedOpen && !isCanceled && (
          <div style={{ marginTop: 10, padding: 10, background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 6 }}>
            <div style={{ fontSize: 11, color: "#5A7A8A", marginBottom: 6 }}>
              Pick a future date. The next charge moves to this date and the
              billing cadence keeps running from there — no pro-rating.
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="datetime-local" value={reschedDate}
                onChange={(e) => setReschedDate(e.target.value)}
                style={{ padding: "6px 8px", border: "1px solid #D1D5DB", borderRadius: 4, fontSize: 12 }} />
              <Button variant="primary" disabled={busy === "reschedule" || !reschedDate}
                onClick={async () => {
                  if (!reschedDate) return;
                  await doAction("reschedule", {
                    body: { next_billing_date: new Date(reschedDate).toISOString() },
                  });
                  setReschedOpen(false);
                }}>
                {busy === "reschedule" ? "Rescheduling…" : "Confirm reschedule"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Line items */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="card-ttl">Line items</div>
            <div className="card-sub" style={{ marginBottom: 8 }}>
              {(sub.items || []).length} item{(sub.items || []).length === 1 ? "" : "s"} on this subscription
            </div>
          </div>
          {/* F-16 — Edit / Save / Cancel */}
          {(sub.items || []).length > 0 && !editingItems && (
            <Button variant="secondary" onClick={() => {
              const d: Record<string, { quantity: number; unitAmount: string; deleted: boolean }> = {};
              for (const it of sub.items || []) {
                d[it.item_id] = {
                  quantity: Number(it.quantity) || 1,
                  unitAmount: String(Number(it.unit_amount ?? 0)),
                  deleted: false,
                };
              }
              setDraftItems(d);
              setEditingItems(true);
            }}>Edit items</Button>
          )}
          {editingItems && (
            <div style={{ display: "flex", gap: 6 }}>
              <Button variant="ghost"
                onClick={() => { setEditingItems(false); setDraftItems({}); setNewItems([]); setPickerOpen(false); }}
                disabled={savingItems}>Cancel</Button>
              <Button variant="primary" disabled={savingItems} onClick={async () => {
                setSavingItems(true);
                try {
                  // Build the items payload — include changed/deleted existing rows
                  // and new rows from the catalog picker.
                  const existingPayload = (sub.items || []).map((it) => {
                    const d = draftItems[it.item_id];
                    if (!d || !it.stripe_subscription_item_id) return null;
                    if (d.deleted) return { stripe_subscription_item_id: it.stripe_subscription_item_id, deleted: true };
                    /* A changed amount mints a price on the same product server-side
                       (Stripe prices are immutable). Only send it when it actually
                       differs, so an untouched line is never re-priced. */
                    const amountChanged = Number(d.unitAmount) !== Number(it.unit_amount);
                    const qtyChanged = d.quantity !== Number(it.quantity);
                    if (!amountChanged && !qtyChanged) return null;
                    return {
                      stripe_subscription_item_id: it.stripe_subscription_item_id,
                      ...(qtyChanged ? { quantity: d.quantity } : {}),
                      ...(amountChanged ? { unit_amount: Number(d.unitAmount) } : {}),
                    };
                  }).filter(Boolean);
                  // New items: oliver-api routes/subscriptions.js:739-743 calls
                  // stripe.subscriptionItems.create when price_id is present
                  // without stripe_subscription_item_id.
                  const newPayload = newItems.map(n => ({ price_id: n.price_id, quantity: n.quantity }));
                  const payload = [...existingPayload, ...newPayload];
                  if (!payload.length) {
                    setEditingItems(false); setDraftItems({}); setNewItems([]); setPickerOpen(false); return;
                  }
                  await api.patch(`/subscriptions/${subscriptionId}`, { items: payload });
                  setEditingItems(false); setDraftItems({}); setNewItems([]); setPickerOpen(false);
                  setToast("Subscription updated"); setTimeout(() => setToast(null), 2500);
                  await reload();
                  onChanged?.();
                } catch (e) {
                  setErr((e as Error).message || "Update failed");
                } finally { setSavingItems(false); }
              }}>{savingItems ? "Saving…" : "Save changes"}</Button>
            </div>
          )}
        </div>
        {(sub.items || []).length === 0 ? (
          <div style={{ fontSize: 12, color: "#5A7A8A", fontStyle: "italic" }}>No items synced. Run "Sync from Stripe".</div>
        ) : (
          <table style={{ width: "100%", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #E5E7EB", color: "#5A7A8A" }}>
                <th style={{ textAlign: "left", padding: "6px 0", fontWeight: 600 }}>Product</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Unit price</th>
                <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600 }}>Qty</th>
                <th style={{ textAlign: "right", padding: "6px 0", fontWeight: 600 }}>Line total</th>
                {editingItems && <th style={{ padding: "6px 0", width: 24 }} aria-label="Remove" />}
              </tr>
            </thead>
            <tbody>
              {editingItems && newItems.map((n) => (
                <tr key={n.tempId} style={{ borderBottom: "1px solid #F3F4F6", background: "#F0FDF4" }}>
                  <td style={{ padding: "8px 0", color: "#0B1C24" }}>
                    <span style={{ display: "inline-block", padding: "1px 6px", fontSize: 10, fontWeight: 700, color: "#15803D", background: "#DCFCE7", borderRadius: 4, marginRight: 6 }}>NEW</span>
                    {n.product_name}
                    {n.recurring_interval && <span style={{ color: "#94A3B8", marginLeft: 6 }}>· /{n.recurring_interval_count && n.recurring_interval_count > 1 ? `${n.recurring_interval_count} ` : ""}{n.recurring_interval}</span>}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(n.unit_amount)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>
                    <input
                      type="number" min={1} value={n.quantity}
                      onChange={(e) => {
                        const q = Math.max(1, Number(e.target.value) || 1);
                        setNewItems(prev => prev.map(p => p.tempId === n.tempId ? { ...p, quantity: q } : p));
                      }}
                      style={{ width: 56, padding: "2px 6px", textAlign: "right", border: "1px solid #E5E7EB", borderRadius: 4 }}
                    />
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(Number(n.unit_amount) * n.quantity)}</td>
                  <td style={{ padding: "8px 0", textAlign: "right" }}>
                    <button
                      onClick={() => setNewItems(prev => prev.filter(p => p.tempId !== n.tempId))}
                      style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                      title="Discard this new item"
                    >×</button>
                  </td>
                </tr>
              ))}
              {(sub.items || []).map((it) => {
                const d = draftItems[it.item_id];
                const qty = editingItems && d ? d.quantity : Number(it.quantity);
                const isDeleted = !!d?.deleted;
                return (
                  <tr key={it.item_id} style={{ borderBottom: "1px solid #F3F4F6", opacity: isDeleted ? 0.35 : 1, textDecoration: isDeleted ? "line-through" : "none" }}>
                    <td style={{ padding: "8px 0", color: "#0B1C24" }}>
                      {it.product_name}
                      {it.recurring_interval && <span style={{ color: "#94A3B8", marginLeft: 6 }}>· /{it.recurring_interval_count && it.recurring_interval_count > 1 ? `${it.recurring_interval_count} ` : ""}{it.recurring_interval}</span>}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {editingItems && !isDeleted ? (
                        <input
                          type="number" min={0} step="0.01"
                          value={d ? d.unitAmount : String(Number(it.unit_amount ?? 0))}
                          onChange={(e) => setDraftItems((prev) => ({
                            ...prev,
                            [it.item_id]: {
                              ...(prev[it.item_id] || { quantity: qty, unitAmount: String(Number(it.unit_amount ?? 0)), deleted: false }),
                              unitAmount: e.target.value,
                            },
                          }))}
                          title="Charge this subscription a different amount for the same product"
                          style={{ width: 92, padding: "2px 6px", textAlign: "right", fontFamily: "monospace", border: "1px solid #E5E7EB", borderRadius: 4 }}
                        />
                      ) : fmtMoney(it.unit_amount)}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right" }}>
                      {editingItems && !isDeleted ? (
                        <input
                          type="number" min={1} value={qty}
                          onChange={(e) => setDraftItems((prev) => ({
                            ...prev,
                            [it.item_id]: { ...(prev[it.item_id] || { quantity: qty, unitAmount: String(Number(it.unit_amount ?? 0)), deleted: false }), quantity: Math.max(1, Number(e.target.value) || 1) },
                          }))}
                          style={{ width: 56, padding: "2px 6px", textAlign: "right", border: "1px solid #E5E7EB", borderRadius: 4 }}
                        />
                      ) : qty}
                    </td>
                    <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>
                      {fmtMoney(Number(editingItems && d ? d.unitAmount || 0 : it.unit_amount) * qty)}
                    </td>
                    {editingItems && (
                      <td style={{ padding: "8px 0", textAlign: "right" }}>
                        {isDeleted ? (
                          <button
                            onClick={() => setDraftItems((prev) => ({ ...prev, [it.item_id]: { ...(prev[it.item_id] || { quantity: qty, unitAmount: String(Number(it.unit_amount ?? 0)), deleted: false }), deleted: false } }))}
                            style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 11 }}
                            title="Undo remove"
                          >undo</button>
                        ) : (
                          <button
                            onClick={() => setDraftItems((prev) => ({ ...prev, [it.item_id]: { ...(prev[it.item_id] || { quantity: qty, unitAmount: String(Number(it.unit_amount ?? 0)), deleted: false }), deleted: true } }))}
                            style={{ background: "none", border: "none", color: "#DC2626", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                            title="Remove this item from the subscription"
                          >×</button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {editingItems && (
          <div style={{ marginTop: 12 }}>
            {!pickerOpen ? (
              <button
                onClick={() => setPickerOpen(true)}
                style={{ background: "none", border: "1px dashed #94A3B8", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "8px 14px", borderRadius: 6 }}
              >+ Add line item</button>
            ) : (
              <div style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: 12, background: "#F8FAFC" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#0B1C24" }}>Add line item from catalog</div>
                  <button
                    onClick={() => { setPickerOpen(false); setPickerSearch(""); }}
                    style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
                    title="Close picker"
                  >×</button>
                </div>
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Search services…"
                  style={{ width: "100%", padding: "6px 10px", fontSize: 12, border: "1px solid #E5E7EB", borderRadius: 4, marginBottom: 8 }}
                  autoFocus
                />
                {!catalogLoaded ? (
                  <div style={{ fontSize: 11, color: "#94A3B8", padding: 8 }}>Loading catalog…</div>
                ) : catalogChoices.length === 0 ? (
                  <div style={{ fontSize: 11, color: "#94A3B8", padding: 8 }}>
                    {catalog.length === 0 ? "No catalog items available." : "No recurring prices match your search."}
                  </div>
                ) : (
                  <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #E5E7EB", borderRadius: 4, background: "white" }}>
                    {catalogChoices.map(({ offering, price, key }) => (
                      <button
                        key={key}
                        onClick={() => {
                          // Don't allow duplicates — if the price is already on the
                          // subscription (existing or pending), bump quantity instead.
                          const existing = (sub?.items || []).find(it => it.stripe_price_id === price.price_id);
                          if (existing) {
                            const current = draftItems[existing.item_id]?.quantity ?? Number(existing.quantity) ?? 1;
                            setDraftItems(prev => ({
                              ...prev,
                              [existing.item_id]: {
                                ...(prev[existing.item_id] ?? { unitAmount: String(Number(existing.unit_amount ?? 0)), deleted: false }),
                                quantity: current + 1,
                                deleted: false,
                              },
                            }));
                          } else {
                            const dup = newItems.find(n => n.price_id === price.price_id);
                            if (dup) {
                              setNewItems(prev => prev.map(p => p.tempId === dup.tempId ? { ...p, quantity: p.quantity + 1 } : p));
                            } else {
                              const tempId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                              setNewItems(prev => [...prev, {
                                tempId,
                                price_id: price.price_id,
                                product_name: offering.name + (price.label ? ` — ${price.label}` : ""),
                                unit_amount: price.unit_amount,
                                recurring_interval: price.recurring_interval || null,
                                recurring_interval_count: price.recurring_interval_count || null,
                                quantity: 1,
                              }]);
                            }
                          }
                          setPickerSearch("");
                          setPickerOpen(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          width: "100%", padding: "8px 12px", border: "none",
                          borderBottom: "1px solid #F3F4F6", background: "white", cursor: "pointer",
                          textAlign: "left", fontSize: 12,
                        }}
                      >
                        <span style={{ color: "#0B1C24" }}>
                          {offering.name}
                          {price.label && <span style={{ color: "#5A7A8A", marginLeft: 6 }}>· {price.label}</span>}
                        </span>
                        <span style={{ color: "#5A7A8A", fontFamily: "monospace" }}>
                          {fmtMoney(price.unit_amount)}/{price.recurring_interval_count && price.recurring_interval_count > 1 ? `${price.recurring_interval_count} ` : ""}{price.recurring_interval}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Recurring job linkage */}
      <div className="card">
        <div className="card-ttl">Recurring job</div>
        <div className="card-sub" style={{ marginBottom: 8 }}>
          Link a recurring job template so each cycle auto-creates a field-service job.
        </div>
        {linkedTemplate ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#F0FDF4", borderLeft: "3px solid #059669", padding: "8px 12px", borderRadius: 4 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0B1C24" }}>{linkedTemplate.title}</div>
              <div style={{ fontSize: 11, color: "#5A7A8A" }}>Cadence: {linkedTemplate.recurrenceInterval}</div>
            </div>
            <a href={`/app/services/oliver_recurring?template=${linkedTemplate.id}`} style={{ fontSize: 11, color: "#1A7DB5" }}>Edit template →</a>
          </div>
        ) : linkPickerOpen ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select value={linkTemplateId} onChange={(e) => setLinkTemplateId(e.target.value)}
              style={{ flex: 1, minWidth: 200, padding: "8px 10px", fontSize: 13, borderRadius: 6, border: "1px solid #cbd5e1" }}>
              <option value="">— Pick a recurring job template —</option>
              {unlinkedTemplates.map((t) => <option key={t.id} value={t.id}>{t.title} · {t.recurrenceInterval}</option>)}
            </select>
            <Button variant="primary" onClick={linkTemplate} disabled={!linkTemplateId || busy === "link"}>
              {busy === "link" ? "Linking…" : "Link"}
            </Button>
            <Button variant="ghost" onClick={() => { setLinkPickerOpen(false); setLinkTemplateId(""); }}>Cancel</Button>
            {!unlinkedTemplates.length && (
              <div style={{ width: "100%", fontSize: 11, color: "#B45309" }}>
                No recurring templates available. Create one on the Subscriptions page first (Recurring jobs tab).
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, color: "#5A7A8A" }}>No recurring job linked.</div>
            <Button variant="secondary" onClick={() => setLinkPickerOpen(true)}>Link a template</Button>
          </div>
        )}
      </div>

      {/* Cycle history */}
      <div className="two-col">
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Jobs from this subscription</div>
              <div className="card-sub">{cycles.jobs.length} auto-generated</div>
            </div>
          </div>
          {cycles.jobs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5A7A8A", fontStyle: "italic", padding: "6px 0" }}>
              No jobs yet. {linkedTemplate ? "Next cycle will auto-create one." : "Link a recurring template to start generating jobs."}
            </div>
          ) : cycles.jobs.map((j) => (
            <div key={j.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9, paddingTop: 6, paddingBottom: 6, borderBottom: "1px solid #F3F4F6" }}>
              <StatusBadge status={j.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{j.title || "(untitled)"}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>
                  {j.scheduledStart ? `Scheduled ${fmtDateTime(j.scheduledStart)}` : `Created ${fmtDateTime(j.createdAt)}`}
                </div>
              </div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>{fmtMoney(j.total)}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-hdr">
            <div>
              <div className="card-ttl">Invoices from this subscription</div>
              <div className="card-sub">{cycles.invoices.length} issued</div>
            </div>
          </div>
          {cycles.invoices.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5A7A8A", fontStyle: "italic", padding: "6px 0" }}>No invoices yet.</div>
          ) : cycles.invoices.map((inv) => (
            <div key={inv.id} className="hrow" style={{ display: "flex", alignItems: "center", gap: 9, paddingTop: 6, paddingBottom: 6, borderBottom: "1px solid #F3F4F6" }}>
              <StatusBadge status={inv.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "#0B1C24" }}>{inv.number || `Invoice ${inv.id.slice(0, 8)}`}</div>
                <div style={{ fontSize: 10, color: "#5A7A8A" }}>{inv.paidAt ? `Paid ${fmtDate(inv.paidAt)}` : inv.dueDate ? `Due ${fmtDate(inv.dueDate)}` : `Created ${fmtDate(inv.createdAt)}`}</div>
              </div>
              <div style={{ fontSize: 12, fontFamily: "monospace", color: "#0B1C24", fontWeight: 600 }}>{fmtMoney(inv.total)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
