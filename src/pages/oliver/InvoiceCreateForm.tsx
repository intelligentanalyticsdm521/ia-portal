import { useEffect, useMemo, useState } from "react";
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

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  is_tax: boolean;
  /** Set when this line came from the service catalog dropdown. */
  service_offering_id?: string;
  service_price_id?: string;
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
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [dueDate, setDueDate] = useState<string>("");
  const [taxRate, setTaxRate] = useState<string>("");          // % e.g. "6"
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [discountValue, setDiscountValue] = useState<string>(""); // % or $
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [c, o, jc, ji] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<Offering[]>("/catalog/offerings?include_prices=1").catch(() => [] as Offering[]),
          get<JobListItem[]>("/jobs?status=completed&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=invoiced&per_page=50").catch(() => [] as JobListItem[]),
        ]);
        setContacts(c || []);
        setOfferings(o || []);
        setJobs([...(jc || []), ...(ji || [])]);
      } catch (e) {
        setError(`Failed to load data: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  // Stripe-style math: discount applies to subtotal, tax applies AFTER the
  // discount (matches Stripe invoicing).
  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (s, it) => s + Number(it.quantity || 0) * Number(it.unit_price || 0), 0);
    const dv = Number(discountValue) || 0;
    const discount = discountType === "percent"
      ? subtotal * (dv / 100)
      : Math.min(dv, subtotal);
    const taxable = Math.max(0, subtotal - discount);
    const rate = Number(taxRate) || 0;
    const tax = taxable * (rate / 100);
    return { subtotal, discount, tax, total: taxable + tax };
  }, [items, discountValue, discountType, taxRate]);

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
      // Derive a discount line (negative) and a tax line so the existing
      // backend subtotal/tax/total math produces Stripe-style numbers.
      const lineOut: LineItemDraft[] = [...cleanedItems];
      if (totals.discount > 0) {
        const lbl = discountType === "percent"
          ? `Discount (${Number(discountValue)}%)` : "Discount";
        lineOut.push({ description: lbl, quantity: 1, unit_price: -Number(totals.discount.toFixed(2)), is_tax: false });
      }
      if (totals.tax > 0) {
        lineOut.push({ description: `Sales Tax (${Number(taxRate)}%)`, quantity: 1, unit_price: Number(totals.tax.toFixed(2)), is_tax: true });
      }
      const body: Record<string, unknown> = {
        line_items: lineOut,
        due_date: dueDate || null,
      };
      if (mode === "job") body.job_id = selectedJobId;
      else body.contact_id = selectedContactId;

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
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="card-ttl">New invoice</div>
          <div className="card-sub">Bill a customer directly or convert a completed job into an invoice</div>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>

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
          <Field label="Customer">
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              style={selectStyle}
            >
              <option value="">— Pick a customer —</option>
              {contacts.map((c) => (
                <option key={c.contact_id} value={c.contact_id}>
                  {contactName(c)}{c.email ? ` · ${c.email}` : ""}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Job">
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
          {items.map((it, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "1fr 70px 110px 92px 28px", gap: 8,
              padding: "8px 10px", alignItems: "center",
              borderBottom: i < items.length - 1 ? "1px solid #f0f4f6" : "none",
            }}>
              <input
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
                type="number" step="0.01" min="0"
                value={it.unit_price}
                onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                style={{ ...inputStyle, textAlign: "right" }}
              />
              <div style={{ textAlign: "right", fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>
                ${(Number(it.quantity || 0) * Number(it.unit_price || 0)).toFixed(2)}
              </div>
              <button
                type="button" onClick={() => removeItem(i)} title="Remove"
                style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, padding: 0 }}
              >×</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={addLine}
            style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>
            + Add line item
          </button>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 300, fontSize: 12 }}>
          <Row label="Subtotal" value={`$${totals.subtotal.toFixed(2)}`} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0" }}>
            <span style={{ color: "#5A7A8A" }}>Discount</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="number" min="0" step="0.01" placeholder="0"
                value={discountValue} onChange={(e) => setDiscountValue(e.target.value)}
                style={{ ...inputStyle, width: 70, textAlign: "right" }} />
              <select value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
                style={{ ...inputStyle, width: 56, padding: "4px 2px" }}>
                <option value="percent">%</option>
                <option value="amount">$</option>
              </select>
              <span style={{ width: 70, textAlign: "right", color: "#059669" }}>
                {totals.discount > 0 ? `−$${totals.discount.toFixed(2)}` : "—"}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0" }}>
            <span style={{ color: "#5A7A8A" }}>Sales tax</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <input type="number" min="0" step="0.001" placeholder="0"
                value={taxRate} onChange={(e) => setTaxRate(e.target.value)}
                style={{ ...inputStyle, width: 70, textAlign: "right" }} />
              <span style={{ width: 18, color: "#5A7A8A" }}>%</span>
              <span style={{ width: 78, textAlign: "right", color: "#B45309" }}>
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
