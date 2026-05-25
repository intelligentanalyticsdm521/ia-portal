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
  cancel: { label: "Cancel", toast: "Cancels at end of period" },
};

export interface SubscriptionDetailPanelProps {
  subscriptionId: string;
  api: {
    get: <T>(p: string) => Promise<T>;
    post: <T>(p: string, b?: unknown) => Promise<T>;
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
          {!isCanceled && !isCancelingSoon && (
            <Button variant="danger" disabled={busy === "cancel"}
              onClick={() => doAction("cancel", { confirm: `Cancel at end of period? Access continues until ${fmtDate(sub.current_period_end)}.`, body: { at_period_end: true } })}>
              {busy === "cancel" ? "Canceling…" : "Cancel at period end"}
            </Button>
          )}
        </div>
      </div>

      {/* Line items */}
      <div className="card">
        <div className="card-ttl">Line items</div>
        <div className="card-sub" style={{ marginBottom: 8 }}>
          {(sub.items || []).length} item{(sub.items || []).length === 1 ? "" : "s"} on this subscription
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
              </tr>
            </thead>
            <tbody>
              {(sub.items || []).map((it) => (
                <tr key={it.item_id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "8px 0", color: "#0B1C24" }}>
                    {it.product_name}
                    {it.recurring_interval && <span style={{ color: "#94A3B8", marginLeft: 6 }}>· /{it.recurring_interval_count && it.recurring_interval_count > 1 ? `${it.recurring_interval_count} ` : ""}{it.recurring_interval}</span>}
                  </td>
                  <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{fmtMoney(it.unit_amount)}</td>
                  <td style={{ padding: "8px", textAlign: "right" }}>{it.quantity}</td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmtMoney(Number(it.unit_amount) * Number(it.quantity))}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
