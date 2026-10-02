import { useEffect, useMemo, useState } from "react";
// ONE customer search, and the forced location picker with it (spec section 7
// point 2). The dropdown this replaces listed every customer in one <select>
// and could not ask which of their buildings the lines were for — which is how
// an invoice prints with no service address on it.
import { CustomerLocationPicker, type CustomerLocationSelection } from "../../components/customers/CustomerLocationPicker";
import { useOliverApi } from "../../hooks/useOliverApi";
import { Button } from "../../components/oliver/ui";

interface JobListItem {
  id: string;
  title: string;
  customerName: string;
  status: string;
}

interface ContactListItem {
  contact_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
}

interface OfferingPrice {
  price_id: string;
  /** API column is unit_amount (catalog returns SELECT *). */
  unit_amount: number;
  currency?: string | null;
  pricing_model?: string | null;
  recurring_interval?: string | null;
  recurring_interval_count?: number | null;
  is_default?: boolean;
  label?: string | null;
}
interface Offering {
  offering_id: string;
  name: string;
  description?: string;
  prices?: OfferingPrice[];
}

/** "$99.99/mo", "$1,079.89/yr", "$150.00 (Per Hour)", "$1,500.00" */
function fmtPrice(p: OfferingPrice): string {
  const amt = `$${Number(p.unit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p.recurring_interval) {
    const n = p.recurring_interval_count && p.recurring_interval_count > 1 ? `${p.recurring_interval_count} ` : "";
    const unit = p.recurring_interval === "month" ? "mo" : p.recurring_interval === "year" ? "yr" : p.recurring_interval;
    return `${amt}/${n}${unit}`;
  }
  return p.label ? `${amt} (${p.label})` : amt;
}

/** A discount that can be a manual %, a manual $, or a saved coupon.
 * Reused for a single line OR the whole invoice. */
interface Disc {
  mode: "none" | "percent" | "amount" | "coupon";
  value: string;       // % or $ when manual
  couponId: string;    // coupon_id when mode === 'coupon'
}
const NO_DISC: Disc = { mode: "none", value: "", couponId: "" };

interface CouponLite {
  coupon_id: string;
  code: string;
  name?: string | null;
  percent_off?: number | null;
  amount_off?: number | null;
}

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  is_tax: boolean;
  discount?: Disc;
  /** Set when this line came from the service catalog dropdown. */
  service_offering_id?: string;
  service_price_id?: string;
}

/** Resolve a Disc to a positive dollar amount off, given a base. */
function discountAmount(d: Disc | undefined, base: number, coupons: CouponLite[]): number {
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

interface CreateInvoiceProps {
  onCreated: () => void;
  onCancel: () => void;
  /** Pre-seed the form with a job (opens in "From a completed job" mode). */
  initialJobId?: string;
  /** Pre-seed the form with a customer (opens in "Bill a customer" mode). */
  initialContactId?: string;
}

const blankItem: LineItemDraft = { description: "", quantity: 1, unit_price: 0, is_tax: false };

function contactName(c: ContactListItem) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

export function InvoiceCreateForm({ onCreated, onCancel, initialJobId, initialContactId }: CreateInvoiceProps) {
  const { get, post, ready } = useOliverApi();
  const [mode, setMode] = useState<"job" | "customer">(initialJobId ? "job" : "customer");
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>(initialJobId || "");
  const [selectedContactId, setSelectedContactId] = useState<string>(initialContactId || "");
  /** Who, and where. The site rides onto every line, which is what groups the
   *  printed invoice by building. */
  const [picked, setPicked] = useState<CustomerLocationSelection>({ customer: null, locationIds: [] });
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [dueDate, setDueDate] = useState<string>("");
  const [coupons, setCoupons] = useState<CouponLite[]>([]);
  const [taxMode, setTaxMode] = useState<"percent" | "amount">("percent");
  const [taxRate, setTaxRate] = useState<string>("");          // % e.g. "6"
  const [taxManual, setTaxManual] = useState<string>("");      // manual $ amount
  const [invDisc, setInvDisc] = useState<Disc>({ ...NO_DISC }); // whole-invoice discount/coupon
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [c, o, jc, ji, cp] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<Offering[]>("/catalog/offerings?include_prices=1").catch(() => [] as Offering[]),
          get<JobListItem[]>("/jobs?status=completed&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=invoiced&per_page=50").catch(() => [] as JobListItem[]),
          get<CouponLite[]>("/coupons").catch(() => [] as CouponLite[]),
        ]);
        setContacts(c || []);
        setOfferings(o || []);
        setJobs([...(jc || []), ...(ji || [])]);
        setCoupons(cp || []);
      } catch (e) {
        setError(`Failed to load data: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  // Stripe-style math: discount applies to subtotal, tax applies AFTER the
  // discount (matches Stripe invoicing).
  const totals = useMemo(() => {
    let gross = 0, lineDiscounts = 0;
    for (const it of items) {
      const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
      gross += lt;
      lineDiscounts += discountAmount(it.discount, lt, coupons);
    }
    const subtotal = gross;                       // pre-discount
    const afterLine = Math.max(0, gross - lineDiscounts);
    const invDiscount = discountAmount(invDisc, afterLine, coupons);
    const totalDiscount = lineDiscounts + invDiscount;
    const taxable = Math.max(0, gross - totalDiscount);
    const tax = taxMode === "amount"
      ? Math.max(0, Number(taxManual) || 0)
      : taxable * ((Number(taxRate) || 0) / 100);
    return { subtotal, lineDiscounts, invDiscount, totalDiscount, tax, total: taxable + tax };
  }, [items, invDisc, coupons, taxMode, taxRate, taxManual]);

  function updateItem(idx: number, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addLine() { setItems((prev) => [...prev, { ...blankItem }]); }

  // Value is "offeringId::priceId" so multi-price products (e.g. monthly vs
  // annual) each add the EXACT price the user picked.
  function addPriceLine(value: string) {
    const [offeringId, priceId] = value.split("::");
    const off = offerings.find((o) => o.offering_id === offeringId);
    if (!off) return;
    const price = off.prices?.find((p) => p.price_id === priceId);
    setItems((prev) => [
      ...prev.filter((it) => it.description.trim() || it.unit_price > 0),
      {
        description: price?.recurring_interval
          ? `${off.name} (${fmtPrice(price)})`
          : (price?.label ? `${off.name} — ${price.label}` : off.name),
        quantity: 1,
        unit_price: price ? Number(price.unit_amount) : 0,
        is_tax: false,
        service_offering_id: off.offering_id,
        service_price_id: price?.price_id,
      },
    ]);
  }

  async function submit() {
    setError(null);
    if (mode === "job" && !selectedJobId) { setError("Pick a job first."); return; }
    if (mode === "customer" && !selectedContactId) { setError("Pick a customer first."); return; }
    const cleanedItems = items.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
    if (!cleanedItems.length) { setError("Add at least one line item."); return; }
    setSubmitting(true);
    try {
      // Emit real lines, a negative line per per-line discount, one negative
      // line for the whole-invoice discount/coupon, then the tax line — so
      // the existing backend subtotal/tax/total math is correct and the
      // Stripe charge (= invoice.total) matches what's shown.
      const lineOut: LineItemDraft[] = [];
      const couponLabel = (d: Disc) => {
        if (d.mode === "coupon") {
          const c = coupons.find((x) => x.coupon_id === d.couponId);
          return c ? `Coupon ${c.code}` : "Coupon";
        }
        return d.mode === "percent" ? `Discount (${Number(d.value)}%)` : "Discount";
      };
      for (const it of cleanedItems) {
        lineOut.push({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, is_tax: false, service_offering_id: it.service_offering_id, service_price_id: it.service_price_id });
        const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
        const da = discountAmount(it.discount, lt, coupons);
        if (da > 0 && it.discount) {
          lineOut.push({ description: `${couponLabel(it.discount)} — ${it.description}`, quantity: 1, unit_price: -Number(da.toFixed(2)), is_tax: false });
        }
      }
      if (totals.invDiscount > 0) {
        lineOut.push({ description: couponLabel(invDisc), quantity: 1, unit_price: -Number(totals.invDiscount.toFixed(2)), is_tax: false });
      }
      if (totals.tax > 0) {
        const tlbl = taxMode === "amount" ? "Sales Tax" : `Sales Tax (${Number(taxRate)}%)`;
        lineOut.push({ description: tlbl, quantity: 1, unit_price: Number(totals.tax.toFixed(2)), is_tax: true });
      }
      const body: Record<string, unknown> = {
        line_items: lineOut,
        due_date: dueDate || null,
      };
      if (mode === "job") body.job_id = selectedJobId;
      else body.contact_id = selectedContactId;
      // Every line carries the site. The server groups by it and taxes each
      // group at that site’s rate (section 9.4).
      if (picked.locationIds[0]) {
        body.line_items = (body.line_items as Array<Record<string, unknown>>).map((li) => ({
          ...li, service_location_id: li.is_tax ? null : picked.locationIds[0],
        }));
      }

      await post("/invoices", body);
      onCreated();
    } catch (e) {
      const msg = (e as Error).message || "";
      if (msg.includes("stripe_not_connected") || msg.includes("412")) {
        setError("Your Stripe account isn't connected yet. Go to Organization Settings → Connected Accounts → Stripe to finish setup.");
      } else {
        setError(`Create failed: ${msg}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    // No card chrome or own header — this form always renders inside the
    // branded document modal now (same treatment as the quote form), which
    // carries the title, the business header and the close control.
    <div>

      {error && (
        <div style={{
          background: "#FEE2E2", border: "1px solid #FECACA",
          color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div className="ptabs" style={{ marginBottom: 12 }}>
        <button className={`ptab${mode === "customer" ? " active" : ""}`} onClick={() => setMode("customer")}>Bill a customer</button>
        <button className={`ptab${mode === "job" ? " active" : ""}`} onClick={() => setMode("job")}>From a completed job</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {mode === "customer" ? (
          <div style={{ gridColumn: "1 / -1" }} data-tour="invoice-customer">
            <CustomerLocationPicker
              value={picked}
              onChange={(next) => {
                setPicked(next);
                // The invoice is still written against the OLIVER contact; the
                // picker is what decides WHICH one, and which of their sites.
                setSelectedContactId(next.customer?.oliverContactId || "");
              }}
              scope="oliver"
            />
          </div>
        ) : (
          <Field label="Job">
            {/* 2026-09-25: "+ Create invoice" on a job that is not finished yet lands
                here with nothing to pick. Say so, plainly, instead of an empty pick. */}
            {initialJobId && jobs.length > 0 && !jobs.some((j) => j.id === initialJobId) && (
              <div style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: "#FEF3C7", color: "#92400E", fontSize: 12 }}>
                That job is not finished yet, so it is not in this list. Finish it on the Job Board and come back, or press "Bill a customer" to invoice them now.
              </div>
            )}
            <select
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Pick a completed/invoiced job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "(untitled)"} — {j.customerName} ({j.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Due date (optional)">
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      {offerings.length > 0 && (
        <Field label="Add from your service catalog (optional)">
          <select onChange={(e) => { if (e.target.value) { addPriceLine(e.target.value); e.target.value = ""; } }} style={selectStyle} defaultValue="">
            <option value="">— Add offering as line item —</option>
            {offerings.map((o) => {
              const ps = o.prices ?? [];
              if (!ps.length) {
                return <option key={o.offering_id} value={`${o.offering_id}::`}>{o.name} (no price set)</option>;
              }
              return (
                <optgroup key={o.offering_id} label={o.name}>
                  {ps.map((p) => (
                    <option key={p.price_id} value={`${o.offering_id}::${p.price_id}`}>
                      {o.name} · {fmtPrice(p)}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
      )}

      <div style={{ marginTop: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px 92px 28px", gap: 8, padding: "0 10px 6px", fontSize: 10, fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>
          <div>Description</div>
          <div style={{ textAlign: "right" }}>Qty</div>
          <div style={{ textAlign: "right" }}>Unit price</div>
          <div style={{ textAlign: "right" }}>Amount</div>
          <div />
        </div>
        <div style={{ border: "1px solid #eef2f4", borderRadius: 6 }}>
          {items.map((it, i) => {
            const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
            const lineDisc = discountAmount(it.discount, lt, coupons);
            return (
            <div key={i} style={{ padding: "8px 10px", borderBottom: i < items.length - 1 ? "1px solid #f0f4f6" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px 92px 28px", gap: 8, alignItems: "center" }}>
                <input
                  data-tour={i === 0 ? "invoice-line-description" : undefined}
                  type="text" placeholder="Description"
                  value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  style={inputStyle}
                />
                <input
                  type="number" step="0.001" min="0"
                  value={it.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })}
                  style={{ ...inputStyle, textAlign: "right" }}
                />
                <input
                  data-tour={i === 0 ? "invoice-line-price" : undefined}
                  type="number" step="0.01" min="0"
                  value={it.unit_price}
                  onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                  style={{ ...inputStyle, textAlign: "right" }}
                />
                <div style={{ textAlign: "right", fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>
                  ${lt.toFixed(2)}
                </div>
                <button
                  type="button" onClick={() => removeItem(i)} title="Remove"
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, padding: 0 }}
                >×</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, paddingLeft: 2 }}>
                <span style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>Line discount</span>
                <DiscountPicker d={it.discount || NO_DISC} coupons={coupons}
                  onChange={(d) => updateItem(i, { discount: d })} />
                {lineDisc > 0 && <span style={{ fontSize: 11, color: "#059669" }}>−${lineDisc.toFixed(2)}</span>}
              </div>
            </div>
          ); })}
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={addLine}
            style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
            + Add line item
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 360, fontSize: 12 }}>
          <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />
          {totals.lineDiscounts > 0 && (
            <Row label="Line discounts" value={`−$${totals.lineDiscounts.toFixed(2)}`} color="#059669" />
          )}

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0", gap: 8 }}>
            <span style={{ color: "#5A7A8A", whiteSpace: "nowrap" }}>Invoice discount</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <DiscountPicker d={invDisc} coupons={coupons} onChange={setInvDisc} />
              <span style={{ width: 64, textAlign: "right", color: "#059669" }}>
                {totals.invDiscount > 0 ? `−$${totals.invDiscount.toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0", gap: 8 }}>
            <span style={{ color: "#5A7A8A" }}>Sales tax</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "percent" | "amount")}
                style={{ ...inputStyle, width: 76, padding: "4px 2px" }}>
                <option value="percent">Rate %</option>
                <option value="amount">Manual $</option>
              </select>
              {taxMode === "percent" ? (
                <input type="number" min="0" step="0.001" placeholder="0"
                  value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                  style={{ ...inputStyle, width: 60, textAlign: "right" }} />
              ) : (
                <input type="number" min="0" step="0.01" placeholder="0.00"
                  value={taxManual} onChange={(e) => setTaxManual(e.target.value)}
                  style={{ ...inputStyle, width: 60, textAlign: "right" }} />
              )}
              <span style={{ width: 64, textAlign: "right", color: "#B45309" }}>
                {totals.tax > 0 ? `$${totals.tax.toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <div style={{ borderTop: "1px solid #eef2f4", marginTop: 4, paddingTop: 6 }}>
            <Row label="Total" value={`$${totals.total.toFixed(2)}`} bold />
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          data-tour="save-invoice"
          onClick={submit}
          disabled={submitting || (mode === "job" ? !selectedJobId : !selectedContactId) || !items.length}
        >
          {submitting ? "Creating…" : "Create invoice (draft)"}
        </Button>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.28)", borderRadius: 6,
  background: "#fff", color: "#0B1C24",
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px", fontSize: 12,
  border: "1px solid rgba(45,156,219,0.18)", borderRadius: 4,
  background: "#fff",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: color || "#5A7A8A", fontWeight: bold ? 600 : 400 }}>
      <span>{label}</span>
      <span style={{ color: bold ? "#0B1C24" : color || "#0B1C24", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

// Reusable discount control — none / % / $ / saved coupon. Used for a single
// line AND the whole invoice (Stripe lets you discount either).
function DiscountPicker({ d, coupons, onChange }: {
  d: Disc; coupons: CouponLite[]; onChange: (d: Disc) => void;
}) {
  const mini: React.CSSProperties = {
    padding: "4px 6px", fontSize: 11, border: "1px solid rgba(45,156,219,0.22)",
    borderRadius: 4, background: "#fff", color: "#0B1C24",
  };
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select value={d.mode} style={{ ...mini, width: 78 }}
        onChange={(e) => onChange({ ...d, mode: e.target.value as Disc["mode"] })}>
        <option value="none">None</option>
        <option value="percent">% off</option>
        <option value="amount">$ off</option>
        {coupons.length > 0 && <option value="coupon">Coupon</option>}
      </select>
      {(d.mode === "percent" || d.mode === "amount") && (
        <input type="number" min="0" step="0.01" placeholder={d.mode === "percent" ? "%" : "$"}
          value={d.value} onChange={(e) => onChange({ ...d, value: e.target.value })}
          style={{ ...mini, width: 56, textAlign: "right" }} />
      )}
      {d.mode === "coupon" && (
        <select value={d.couponId} style={{ ...mini, width: 150 }}
          onChange={(e) => onChange({ ...d, couponId: e.target.value })}>
          <option value="">— pick coupon —</option>
          {coupons.map((c) => (
            <option key={c.coupon_id} value={c.coupon_id}>
              {c.code}{c.percent_off != null ? ` (${c.percent_off}%)` : c.amount_off != null ? ` ($${c.amount_off})` : ""}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}
