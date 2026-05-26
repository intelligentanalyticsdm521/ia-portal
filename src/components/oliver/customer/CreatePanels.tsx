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
//
// Founder spec 2026-05-25 — Recurring/subscription unification:
//   Tenants can toggle "Recurring" at create time. When ON, the form
//   collapses to a recurring catalog product picker + start_date. Server
//   creates Stripe sub + recurring_job_template + first job in one call,
//   and the parent CustomerModal jumps to the first job.
// ─────────────────────────────────────────────────────────────────────────────
export function JobCreatePanel({
  customerId, api, onCancel, onCreated, topSlot, onRecurringCreated,
}: BasePanelProps & {
  /** When the Recurring toggle is ON and submit succeeds, this callback
   *  fires with the new subscription + first job. Parent CustomerModal
   *  routes to the new job's detail. */
  onRecurringCreated?: RecurringCreatedFn;
}) {
  const [recurring, setRecurring] = useState(false);
  const [title, setTitle] = useState("");
  const [jobType, setJobType] = useState("");
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  // Recurring-mode state
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [recurringOfferingsLoaded, setRecurringOfferingsLoaded] = useState(false);
  const [recurringPriceId, setRecurringPriceId] = useState("");
  const [recurringStartDate, setRecurringStartDate] = useState<string>(defaultStartDate());
  // Billing method (F-21) — only meaningful in recurring mode.
  const [collectionMethod, setCollectionMethod] = useState<"charge_automatically" | "send_invoice">("charge_automatically");
  const [daysUntilDue, setDaysUntilDue] = useState("30");
  const [hasCardOnFile, setHasCardOnFile] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load saved cards once we're in recurring mode (only matters there).
  useEffect(() => {
    if (!recurring) return;
    (async () => {
      try {
        const r = await api.get<{ data: Array<{ id: string }> } | Array<{ id: string }>>(`/payments/contacts/${customerId}/methods`);
        const list = Array.isArray(r) ? r : ((r as any).data ?? []);
        setHasCardOnFile(list.length > 0);
      } catch { setHasCardOnFile(false); }
    })();
  }, [recurring, api, customerId]);

  // Lazy-load catalog when user toggles into recurring mode.
  useEffect(() => {
    if (!recurring || recurringOfferingsLoaded) return;
    (async () => {
      try {
        const data = await api.get<{ data: CatalogOffering[] } | CatalogOffering[]>("/catalog/offerings?include_prices=1");
        setOfferings(Array.isArray(data) ? data : ((data as any).data ?? []));
      } catch { setOfferings([]); }
      finally { setRecurringOfferingsLoaded(true); }
    })();
  }, [recurring, recurringOfferingsLoaded, api]);

  const recurringPriceOptions = offerings.flatMap((o) =>
    (o.prices ?? [])
      .filter((p) => p.pricing_model === "recurring" || p.recurring_interval)
      .map((p) => ({
        offering: o.name,
        price_id: p.price_id,
        label: `${o.name} · $${Number(p.unit_amount).toFixed(2)}/${p.recurring_interval_count && p.recurring_interval_count > 1 ? `${p.recurring_interval_count} ` : ""}${p.recurring_interval}${p.label ? ` (${p.label})` : ""}`,
      })),
  );

  async function submit() {
    setErr(null);

    // ── Recurring path ──
    // Founder spec 2026-05-25: tenant picks a recurring catalog product +
    // a start date. We post to /subscriptions with auto_create_first_job,
    // and the parent CustomerModal jumps to the new first job.
    if (recurring) {
      if (!recurringPriceId) { setErr("Pick a recurring product/service from the catalog."); return; }
      if (!recurringStartDate) { setErr("Pick a start date for the first occurrence."); return; }
      if (collectionMethod === "charge_automatically" && hasCardOnFile === false) {
        setErr("Automatic billing needs a payment method on file. Add a card on the Overview tab first, or switch to Send invoice below.");
        return;
      }
      setSubmitting(true);
      try {
        const subRes = await api.post<{
          subscription_id?: string;
          id?: string;
          first_job_id?: string | null;
          auto_create_first_job_error?: string | null;
        }>("/subscriptions", {
          contact_id: customerId,
          items: [{ price_id: recurringPriceId, quantity: 1 }],
          start_date: new Date(recurringStartDate).toISOString(),
          collection_method: collectionMethod,
          days_until_due: collectionMethod === "send_invoice" ? Number(daysUntilDue || 30) : undefined,
          auto_create_first_job: true,
        });
        const subId = (subRes as any)?.subscription_id || (subRes as any)?.id || "";
        const firstJobId = (subRes as any)?.first_job_id || null;
        const autoErr = (subRes as any)?.auto_create_first_job_error;
        if (autoErr) {
          // Keep panel mounted so user can read the error before dismissing.
          setErr(`Subscription created (id ${subId.slice(0, 8)}…), but the first job was NOT auto-created: ${autoErr}. You can create a job manually from this customer's Jobs tab once you close this panel.`);
          return;
        }
        if (onRecurringCreated) {
          onRecurringCreated({ subscriptionId: subId, firstJobId });
        } else if (firstJobId) {
          onCreated(firstJobId);
        } else {
          onCreated(subId);
        }
      } catch (e) { setErr(`Create failed: ${(e as Error).message}`); }
      finally { setSubmitting(false); }
      return;
    }

    // ── One-time path ──
    // Title is OPTIONAL — if blank, auto-fill from the first line item.
    // Validation: require EITHER a title OR at least one line item.
    let effectiveTitle = title.trim();
    if (!effectiveTitle && items.length > 0) {
      effectiveTitle = items[0].description?.trim() || "";
    }
    if (!effectiveTitle && items.length === 0) {
      setErr("Add a job title or at least one line item.");
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create the job tied to this customer.
      //    Note: oliverApi auto-unwraps `data`, so jobRes is the raw DB row.
      //    POST /jobs returns the row with the column name `job_id` (not `id`).
      const jobRes = await api.post<{ job_id?: string; id?: string }>("/jobs", {
        contact_id: customerId,
        title: effectiveTitle,
        job_type: jobType.trim() || null,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : null,
        scheduled_end: scheduledEnd ? new Date(scheduledEnd).toISOString() : null,
        team_notes: teamNotes.trim() || null,
        customer_notes: customerNotes.trim() || null,
        source: "manual",
      });
      const newId = (jobRes as any)?.job_id || (jobRes as any)?.id || (jobRes as any)?.data?.job_id;
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="card-ttl">New job</div>
            <div className="card-sub" style={{ marginBottom: 10 }}>
              {recurring
                ? "Recurring — picks a catalog product, sets up the subscription, and auto-creates the first job on the start date."
                : "Skip the quote and go straight to a scheduled job. Line items optional — add later from the job detail view."}
            </div>
          </div>
          {/* One-time / Recurring segmented toggle */}
          <div role="tablist" aria-label="Job kind" style={{
            display: "inline-flex", background: "#F1F5F9", borderRadius: 6, padding: 2, fontSize: 11,
          }}>
            <button type="button" role="tab" aria-selected={!recurring}
              onClick={() => setRecurring(false)}
              style={{
                padding: "4px 10px", borderRadius: 4, border: "none",
                background: !recurring ? "#fff" : "transparent",
                color: !recurring ? "#0B1C24" : "#5A7A8A",
                fontWeight: !recurring ? 700 : 500, cursor: "pointer",
                boxShadow: !recurring ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}>
              One-time
            </button>
            <button type="button" role="tab" aria-selected={recurring}
              onClick={() => setRecurring(true)}
              style={{
                padding: "4px 10px", borderRadius: 4, border: "none",
                background: recurring ? "#fff" : "transparent",
                color: recurring ? "#0B1C24" : "#5A7A8A",
                fontWeight: recurring ? 700 : 500, cursor: "pointer",
                boxShadow: recurring ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}>
              Recurring
            </button>
          </div>
        </div>

        {recurring ? (
          // Recurring fields — picks one recurring product + start date.
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <div>
              <label style={labelS}>Recurring product/service *</label>
              <select value={recurringPriceId} onChange={(e) => setRecurringPriceId(e.target.value)}
                style={inputS}
                disabled={recurringOfferingsLoaded && recurringPriceOptions.length === 0}>
                <option value="">
                  {!recurringOfferingsLoaded ? "Loading catalog…"
                    : recurringPriceOptions.length === 0 ? "No recurring prices in catalog — add a monthly/weekly price first"
                    : "— Pick a recurring price —"}
                </option>
                {recurringPriceOptions.map((p) => (
                  <option key={p.price_id} value={p.price_id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelS}>First occurrence date *</label>
              <input type="datetime-local" value={recurringStartDate}
                onChange={(e) => setRecurringStartDate(e.target.value)} style={{ ...inputS, maxWidth: 280 }} />
              <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
                The subscription's billing cadence is set automatically from the product. We'll create the
                first scheduled job at this date so you can assign crew immediately.
              </div>
            </div>
            <BillingMethodPicker
              collectionMethod={collectionMethod}
              onChangeMethod={setCollectionMethod}
              daysUntilDue={daysUntilDue}
              onChangeDays={setDaysUntilDue}
              hasCardOnFile={hasCardOnFile}
            />
          </div>
        ) : (
          // One-time fields (unchanged)
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <div>
                <label style={labelS}>Job title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={items.length > 0
                    ? `Defaults to "${items[0].description}" if left blank`
                    : "Leave blank — will auto-fill from the first line item"}
                  style={inputS} />
              </div>
              <div>
                <label style={labelS}>Job type (optional)</label>
                <input value={jobType} onChange={(e) => setJobType(e.target.value)}
                  placeholder="Each line has its own category — this is for extra detail"
                  style={inputS} />
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
          </>
        )}
      </div>

      {/* Line items section only shows in one-time mode — recurring sub items
          come from the chosen catalog price. */}
      {!recurring && (
        <div className="card">
          <div className="card-ttl">Line items (optional at create)</div>
          <div className="card-sub" style={{ marginBottom: 10 }}>
            Add services from your catalog or custom lines. The job total will be the sum.
          </div>
          <CatalogLineItemPicker items={items} onChange={setItems} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit}
          disabled={submitting || (recurring
            ? (!recurringPriceId || !recurringStartDate || (collectionMethod === "charge_automatically" && hasCardOnFile === false))
            : (!title.trim() && items.length === 0))}>
          {submitting
            ? "Creating…"
            : recurring ? "Create subscription & first job" : "Create job"}
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
      // POST /quotes expects `line_items` (not `items`). API contract docs in
      // oliver-api/routes/quotes.js line 17.
      const res = await api.post<{ quote_id?: string; id?: string }>("/quotes", {
        contact_id: customerId,
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        notes: notes.trim() || null,
        line_items: items.map((it, i) => ({
          description: it.description,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          sort_order: i,
          service_offering_id: it.service_offering_id || null,
        })),
      });
      onCreated((res as any)?.quote_id || (res as any)?.id || "");
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
      // POST /invoices expects `line_items` (not `items`). API contract docs in
      // oliver-api/routes/invoices.js line 77.
      const res = await api.post<{ invoice_id?: string; id?: string }>("/invoices", {
        contact_id: customerId,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        line_items: items.map((it, i) => ({
          description: it.description,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          line_total: Math.round(Number(it.quantity || 1) * Number(it.unit_price || 0) * 100) / 100,
          sort_order: i,
          service_offering_id: it.service_offering_id || null,
        })),
      });
      onCreated((res as any)?.invoice_id || (res as any)?.id || "");
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

/** Default start date for a new subscription's first job — today at 9am local. */
function defaultStartDate(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Extended onCreated callback that also returns the first_job_id, so the
 *  parent CustomerModal can jump straight to it after a recurring create. */
type RecurringCreatedFn = (args: { subscriptionId: string; firstJobId?: string | null }) => void;

export function SubscriptionCreatePanel({
  customerId, api, onCancel, onCreated, topSlot,
  onRecurringCreated,
}: BasePanelProps & {
  /** When provided, called instead of onCreated so the parent can route to
   *  the auto-created first job. The default `onCreated(id)` still fires
   *  via fallback so legacy callers don't break. */
  onRecurringCreated?: RecurringCreatedFn;
}) {
  const [offerings, setOfferings] = useState<CatalogOffering[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lines, setLines] = useState<RecurringLine[]>([]);
  const [trialDays, setTrialDays] = useState("");
  const [startDate, setStartDate] = useState<string>(defaultStartDate());
  // Founder spec 2026-05-26: never let a sub end up 'incomplete'. Two
  // explicit billing paths — pick one before submit.
  const [collectionMethod, setCollectionMethod] = useState<"charge_automatically" | "send_invoice">("charge_automatically");
  const [daysUntilDue, setDaysUntilDue] = useState("30");
  // Saved-card check — needed when collectionMethod=charge_automatically.
  const [hasCardOnFile, setHasCardOnFile] = useState<boolean | null>(null);
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

  // Probe customer's saved cards — needed to validate auto-charge selection.
  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<{ data: Array<{ id: string }> } | Array<{ id: string }>>(`/payments/contacts/${customerId}/methods`);
        const list = Array.isArray(r) ? r : ((r as any).data ?? []);
        setHasCardOnFile(list.length > 0);
      } catch { setHasCardOnFile(false); }
    })();
  }, [api, customerId]);

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
    if (!startDate) { setErr("Pick a start date for the first job."); return; }
    if (collectionMethod === "charge_automatically" && hasCardOnFile === false) {
      setErr("Automatic billing needs a payment method on file. Add a card on the Overview tab first, or switch to Send invoice below.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{
        subscription_id?: string;
        id?: string;
        first_job_id?: string | null;
        auto_create_first_job_error?: string | null;
      }>("/subscriptions", {
        contact_id: customerId,
        items: lines.map((l) => ({ price_id: l.price_id, quantity: l.quantity })),
        trial_days: trialDays ? Number(trialDays) : undefined,
        start_date: new Date(startDate).toISOString(),
        // Billing method (F-21) — never produces an 'incomplete' sub.
        collection_method: collectionMethod,
        days_until_due: collectionMethod === "send_invoice" ? Number(daysUntilDue || 30) : undefined,
        // Recurring/subscription unification: server auto-creates the
        // recurring_job_template + first job at start_date so the user can
        // schedule the crew straight away.
        auto_create_first_job: true,
      });
      const subId = (res as any)?.subscription_id || (res as any)?.id || "";
      const firstJobId = (res as any)?.first_job_id || null;
      const autoErr = (res as any)?.auto_create_first_job_error;
      if (autoErr) {
        // Sub succeeded; auto-create first job didn't. Show the error and
        // KEEP THE PANEL OPEN — calling onRecurringCreated would unmount us
        // before the user can read what went wrong. They can hit Cancel to
        // close manually after seeing the diagnostic.
        setErr(`Subscription created (id ${subId.slice(0, 8)}…), but the first job was NOT auto-created: ${autoErr}. You can create a job manually from this customer's Jobs tab once you close this panel.`);
        return;
      }
      // Prefer the recurring-aware callback if the parent provided one.
      if (onRecurringCreated) {
        onRecurringCreated({ subscriptionId: subId, firstJobId });
      } else {
        onCreated(subId);
      }
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <div>
            <label style={labelS}>First job start date *</label>
            <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputS} />
            <div style={{ fontSize: 10, color: "#5A7A8A", marginTop: 4 }}>
              A scheduled job will be auto-created for this date when the subscription is saved.
            </div>
          </div>
          <div>
            <label style={labelS}>Free trial days (optional)</label>
            <input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} style={{ ...inputS, width: 120 }} />
          </div>
        </div>

        {/* Billing method choice (F-21): never let sub end up 'incomplete'. */}
        <BillingMethodPicker
          collectionMethod={collectionMethod}
          onChangeMethod={setCollectionMethod}
          daysUntilDue={daysUntilDue}
          onChangeDays={setDaysUntilDue}
          hasCardOnFile={hasCardOnFile}
        />
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: "1px solid #F1F5F9" }}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={submit}
          disabled={submitting || lines.length === 0 || (collectionMethod === "charge_automatically" && hasCardOnFile === false)}>
          {submitting ? "Creating…" : "Create subscription"}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BillingMethodPicker — shared between SubscriptionCreatePanel and
// JobCreatePanel's recurring path. Founder spec 2026-05-26: every recurring
// thing has an explicit billing method, never lands at "incomplete".
//   - Auto-charge → must have a saved card; sub goes active immediately.
//   - Send invoice → Stripe emails customer a payment link each cycle.
// ─────────────────────────────────────────────────────────────────────────────
function BillingMethodPicker({
  collectionMethod, onChangeMethod,
  daysUntilDue, onChangeDays,
  hasCardOnFile,
}: {
  collectionMethod: "charge_automatically" | "send_invoice";
  onChangeMethod: (m: "charge_automatically" | "send_invoice") => void;
  daysUntilDue: string;
  onChangeDays: (d: string) => void;
  hasCardOnFile: boolean | null;
}) {
  const auto = collectionMethod === "charge_automatically";
  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 4, paddingTop: 12, borderTop: "1px solid #F1F5F9" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.4 }}>
        Billing method
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <BillingCard
          selected={auto}
          onClick={() => onChangeMethod("charge_automatically")}
          title="Auto-charge"
          subtitle="Stripe charges the default card on file each cycle"
        />
        <BillingCard
          selected={!auto}
          onClick={() => onChangeMethod("send_invoice")}
          title="Send invoice"
          subtitle="Stripe emails the customer a payment link each cycle"
        />
      </div>

      {auto && hasCardOnFile === false && (
        <div style={{
          marginTop: 10,
          background: "#FEF3C7", border: "1px solid #FDE68A",
          color: "#92400E", borderRadius: 6, padding: "8px 12px", fontSize: 12,
        }}>
          ⚠ No payment method on file. Add a card on the customer's <strong>Overview tab</strong> first
          — or switch to <strong>Send invoice</strong> above.
        </div>
      )}

      {!auto && (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "#5A7A8A" }}>Days until invoice is due:</span>
          <input
            type="number" min={1} max={365}
            value={daysUntilDue} onChange={(e) => onChangeDays(e.target.value)}
            style={{ width: 80, padding: "6px 8px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6 }}
          />
        </div>
      )}
    </div>
  );
}

function BillingCard({
  selected, onClick, title, subtitle,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        textAlign: "left", padding: "10px 12px",
        background: selected ? "#E8F4FB" : "#fff",
        border: `2px solid ${selected ? "#1A7DB5" : "#E5E7EB"}`,
        borderRadius: 8, cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: selected ? "#0C4A60" : "#0B1C24" }}>{title}</div>
      <div style={{ fontSize: 11, color: "#5A7A8A", marginTop: 2 }}>{subtitle}</div>
    </button>
  );
}
