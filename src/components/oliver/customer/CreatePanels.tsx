/**
 * CreatePanels — inline "+ New X" forms that render INSIDE the CustomerModal
 * (founder spec 2026-05-25: "everything handled inside the modal").
 *
 * Each panel:
 *   - Lives inside its section (Jobs / Quotes / Invoices / Subscriptions)
 *   - Replaces the list view while open (same pattern as JobDetailPanel —
 *     "← back to list" cancels and returns to the listing)
 *   - Is contextually pre-bound to the customer that owns the modal —
 *     customer picker UI is intentionally absent
 *   - Posts to the existing oliver-api endpoints and calls onCreated(id)
 *     so the parent can refresh + jump to the new record's detail view
 *
 * Skipping the quote and going straight to a job is the default flow —
 * the Jobs section's "+ New job" button is the primary CTA.
 */
import { useCallback, useEffect, useState } from "react";
import { Button } from "../ui";
import { CatalogLineItemPicker, type LineItem } from "../CatalogLineItemPicker";

type Api = {
  get: <T>(p: string) => Promise<T>;
  post: <T>(p: string, b?: unknown) => Promise<T>;
};

interface BasePanelProps {
  customerId: string;
  api: Api;
  onCancel: () => void;
  onCreated: (newId: string) => void;
  topSlot?: React.ReactNode;
}

const inputS: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6, background: "#fff",
};
const labelS: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4,
};

function backLink(onCancel: () => void, label: string) {
  return (
    <button
      onClick={onCancel}
      style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 500, marginBottom: 10 }}
    >
      ← Cancel — back to {label}
    </button>
  );
}

function ErrBox({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div style={{ background: "#FEE2E2", border: "1px solid #FECACA", color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12 }}>
      {msg}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// JobCreatePanel — the primary CTA in the modal. Title + schedule + catalog
// line items. Skipping a quote is the explicit default (founder spec).
// ─────────────────────────────────────────────────────────────────────────────
export function JobCreatePanel({ customerId, api, onCancel, onCreated, topSlot }: BasePanelProps) {
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (!title.trim()) { setErr("Job title is required."); return; }
    setSubmitting(true);
    try {
      // 1. Create the job tied to this customer.
      const jobRes = await api.post<{ id?: string; data?: { id?: string } }>("/jobs", {
        contact_id: customerId,
        title: title.trim(),
        job_type: jobType.trim() || null,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        scheduled_end: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
        team_notes: teamNotes.trim() || null,
        customer_notes: customerNotes.trim() || null,
        source: "manual",
      });
      const newId = (jobRes as any)?.id || (jobRes as any)?.data?.id;
      if (!newId) throw new Error("Job created but no id returned.");

      // 2. Persist line items if any were added at create time. Backend
      //    recomputes job.total = SUM(line_total) on POST.
      if (items.length > 0) {
        await api.post(`/jobs/${newId}/line-items`, {
          items: items.map((it, i) => ({
            description: it.description,
            quantity: Number(it.quantity || 1),
            unit_price: Number(it.unit_price || 0),
            service_offering_id: it.service_offering_id || null,
            duration_minutes: it.duration_minutes ?? null,
            sort_order: i,
          })),
        });
      }
      onCreated(newId);
    } catch (e) {
      const msg = (e as Error).message || "";
      setErr(msg.includes("402") || msg.includes("job_limit_reached")
        ? "You've hit your Lite-tier job limit (50 active jobs). Upgrade to Standard to add more."
        : `Create failed: ${msg}`);
    } finally { setSubmitting(false); }
  }

  return (
    <div>
      {topSlot}
      {backLink(onCancel, "jobs")}
      <ErrBox msg={err} />

      <div className="card">
        <div className="card-ttl">New job</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Skip the quote and go straight to a scheduled job. Line items optional — add later from the job detail view.
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <div>
            <label style={labelS}>Job title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Roof repair, monthly lawn care, plumbing service" style={inputS} />
          </div>
          <div>
            <label style={labelS}>Job type (optional)</label>
            <input value={jobType} onChange={(e) => setJobType(e.target.value)}
              placeholder="Maintenance, Repair, Install" style={inputS} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <div>
            <label style={labelS}>Scheduled start (optional)</label>
            <input type="datetime-local" value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Scheduled end (optional)</label>
            <input type="datetime-local" value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)} style={inputS} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <div>
            <label style={labelS}>Customer notes (visible in portal)</label>
            <textarea rows={2} value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              style={{ ...inputS, fontFamily: "inherit", resize: "vertical" }} />
          </div>
          <div>
            <label style={labelS}>Internal team notes</label>
            <textarea rows={2} value={teamNotes}
              onChange={(e) => setTeamNotes(e.target.value)}
              style={{ ...inputS, fontFamily: "inherit", resize: "vertical" }} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-ttl">Line items (optional at create)</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Add services from your catalog or custom lines. The job total will be the sum.
        </div>
        <CatalogLineItemPicker items={items} onChange={setItems} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || !title.trim()}>
          {submitting ? "Creating…" : "Create job"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuoteCreatePanel — title + valid-until + catalog line items. Posts to
// /quotes with this customer + items.
// ─────────────────────────────────────────────────────────────────────────────
export function QuoteCreatePanel({ customerId, api, onCancel, onCreated, topSlot }: BasePanelProps) {
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (items.length === 0) { setErr("Add at least one line item."); return; }
    const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    setSubmitting(true);
    try {
      const res = await api.post<{ id?: string; quote_id?: string; data?: any }>("/quotes", {
        contact_id: customerId,
        subtotal,
        total: subtotal,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
        items: items.map((it, i) => ({
          description: it.description,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          line_total: Math.round(Number(it.quantity || 1) * Number(it.unit_price || 0) * 100) / 100,
          sort_order: i,
          service_offering_id: it.service_offering_id || null,
        })),
      });
      const newId = (res as any)?.id || (res as any)?.quote_id || (res as any)?.data?.quote_id || (res as any)?.data?.id || "";
      onCreated(newId || "");
    } catch (e) { setErr(`Create failed: ${(e as Error).message}`); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      {topSlot}
      {backLink(onCancel, "quotes")}
      <ErrBox msg={err} />

      <div className="card">
        <div className="card-ttl">New quote</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Build a quote from your catalog. Customer can accept or decline; accepted quotes can convert to invoices.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div>
            <label style={labelS}>Valid until</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Notes (visible to customer)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputS} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-ttl">Line items *</div>
        <CatalogLineItemPicker items={items} onChange={setItems} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || items.length === 0}>
          {submitting ? "Creating…" : "Create quote"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InvoiceCreatePanel — title + due date + catalog line items. Posts to
// /invoices with this customer.
// ─────────────────────────────────────────────────────────────────────────────
export function InvoiceCreatePanel({ customerId, api, onCancel, onCreated, topSlot }: BasePanelProps) {
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    if (items.length === 0) { setErr("Add at least one line item."); return; }
    const subtotal = items.reduce((s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    setSubmitting(true);
    try {
      const res = await api.post<{ id?: string; invoice_id?: string; data?: any }>("/invoices", {
        contact_id: customerId,
        subtotal,
        total: subtotal,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        items: items.map((it, i) => ({
          description: it.description,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          line_total: Math.round(Number(it.quantity || 1) * Number(it.unit_price || 0) * 100) / 100,
          sort_order: i,
          service_offering_id: it.service_offering_id || null,
        })),
      });
      const newId = (res as any)?.id || (res as any)?.invoice_id || (res as any)?.data?.invoice_id || (res as any)?.data?.id || "";
      onCreated(newId || "");
    } catch (e) { setErr(`Create failed: ${(e as Error).message}`); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      {topSlot}
      {backLink(onCancel, "invoices")}
      <ErrBox msg={err} />

      <div className="card">
        <div className="card-ttl">New invoice</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>Bills the customer directly via Stripe. No job linkage required — useful for one-off charges.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
          <div>
            <label style={labelS}>Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputS} />
          </div>
          <div>
            <label style={labelS}>Memo (visible to customer)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} style={inputS} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-ttl">Line items *</div>
        <CatalogLineItemPicker items={items} onChange={setItems} />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || items.length === 0}>
          {submitting ? "Creating…" : "Create invoice"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionCreatePanel — picks a recurring price from the catalog,
// optional discount + trial. Posts to /subscriptions with this customer.
// ─────────────────────────────────────────────────────────────────────────────
interface CatalogOffering {
  offering_id: string;
  name: string;
  prices?: Array<{
    price_id: string;
    unit_amount: number;
    recurring_interval?: string | null;
    recurring_interval_count?: number | null;
    pricing_model?: string | null;
    label?: string | null;
  }>;
}
interface RecurringLine {
  key: string;
  price_id: string;
  label: string;
  unit_amount: number;
  recurring_interval: string;
  recurring_interval_count: number;
  quantity: number;
}

export function SubscriptionCreatePanel({ customerId, api, onCancel, onCreated, topSlot }: BasePanelProps) {
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lines, setLines] = useState<RecurringLine[]>([]);
  const [trialDays, setTrialDays] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const data = await api.get<{ data: CatalogOffering[] } | CatalogOffering[]>("/catalog/offerings?include_prices=1");
      setOfferings(Array.isArray(data) ? data : ((data as any).data ?? []));
    } catch { setOfferings([]); }
    finally { setLoaded(true); }
  }, [api]);
  useEffect(() => { reload(); }, [reload]);

  const allRecurringPrices = offerings.flatMap((o) =>
    (o.prices ?? [])
      .filter((p) => p.pricing_model === "recurring" || p.recurring_interval)
      .map((p) => ({
        offering: o.name, price_id: p.price_id,
        label: `${o.name} · $${Number(p.unit_amount).toFixed(2)}/${p.recurring_interval_count && p.recurring_interval_count > 1 ? `${p.recurring_interval_count} ` : ""}${p.recurring_interval}${p.label ? ` (${p.label})` : ""}`,
        unit_amount: Number(p.unit_amount),
        recurring_interval: p.recurring_interval || "month",
        recurring_interval_count: p.recurring_interval_count || 1,
      })),
  );

  async function submit() {
    setErr(null);
    if (lines.length === 0) { setErr("Add at least one recurring price."); return; }
    setSubmitting(true);
    try {
      const res = await api.post<{ id?: string; subscription_id?: string; data?: any }>("/subscriptions", {
        contact_id: customerId,
        items: lines.map((l) => ({ price_id: l.price_id, quantity: l.quantity })),
        trial_days: trialDays ? Number(trialDays) : undefined,
      });
      const newId = (res as any)?.id || (res as any)?.subscription_id || (res as any)?.data?.subscription_id || (res as any)?.data?.id || "";
      onCreated(newId || "");
    } catch (e) { setErr(`Create failed: ${(e as Error).message}`); }
    finally { setSubmitting(false); }
  }

  return (
    <div>
      {topSlot}
      {backLink(onCancel, "subscriptions")}
      <ErrBox msg={err} />

      <div className="card">
        <div className="card-ttl">New subscription</div>
        <div className="card-sub" style={{ marginBottom: 10 }}>
          Creates the subscription in Stripe + OLIVER in one step. Link a recurring job template from the subscription detail view after creating.
        </div>
        <div>
          <label style={labelS}>Add recurring price (from catalog)</label>
          <select
            value=""
            onChange={(e) => {
              const p = allRecurringPrices.find((x) => x.price_id === e.target.value);
              if (p) setLines((prev) => [...prev, {
                key: crypto.randomUUID(), price_id: p.price_id, label: p.label,
                unit_amount: p.unit_amount,
                recurring_interval: p.recurring_interval,
                recurring_interval_count: p.recurring_interval_count,
                quantity: 1,
              }]);
            }}
            style={inputS}
            disabled={loaded && allRecurringPrices.length === 0}
          >
            <option value="">{loaded && allRecurringPrices.length === 0 ? "No recurring prices in catalog — add a monthly/annual price first" : "— Pick a recurring price —"}</option>
            {allRecurringPrices.map((p) => <option key={p.price_id} value={p.price_id}>{p.label}</option>)}
          </select>
        </div>

        {lines.length > 0 && (
          <div style={{ border: "1px solid #eef2f4", borderRadius: 8, marginTop: 10 }}>
            {lines.map((l, i) => (
              <div key={l.key} style={{ padding: "8px 10px", borderBottom: i < lines.length - 1 ? "1px solid #f0f4f6" : "none", display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, fontSize: 12, color: "#0B1C24" }}>{l.label}</div>
                <input type="number" min={1} value={l.quantity}
                  onChange={(e) => setLines((prev) => prev.map((x) => x.key === l.key ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                  style={{ ...inputS, width: 60, textAlign: "right" }} />
                <button onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                  style={{ color: "#dc2626", fontSize: 12, background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={labelS}>Free trial days (optional)</label>
          <input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} style={{ ...inputS, width: 120 }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={submitting || lines.length === 0}>
          {submitting ? "Creating…" : "Create subscription"}
        </Button>
      </div>
    </div>
  );
}
