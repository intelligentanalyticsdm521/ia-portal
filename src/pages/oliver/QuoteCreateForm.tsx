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

function fmtPrice(p: OfferingPrice): string {
  const amt = `$${Number(p.unit_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (p.recurring_interval) {
    const n = p.recurring_interval_count && p.recurring_interval_count > 1 ? `${p.recurring_interval_count} ` : "";
    const unit = p.recurring_interval === "month" ? "mo" : p.recurring_interval === "year" ? "yr" : p.recurring_interval;
    return `${amt}/${n}${unit}`;
  }
  return p.label ? `${amt} (${p.label})` : amt;
}

interface Disc { mode: "none" | "percent" | "amount" | "coupon"; value: string; couponId: string; }
const NO_DISC: Disc = { mode: "none", value: "", couponId: "" };
interface CouponLite { coupon_id: string; code: string; name?: string | null; percent_off?: number | null; amount_off?: number | null; }
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

interface LineItemDraft {
  description: string;
  quantity: number;
  unit_price: number;
  is_tax?: boolean;
  discount?: Disc;
  /** Set when this line came from the service catalog dropdown. */
  service_offering_id?: string;
  service_price_id?: string;
}

interface CreateQuoteProps {
  onCreated: () => void;
  onCancel: () => void;
  /** When provided, opens the form in "job" mode with this job pre-selected. */
  initialJobId?: string;
  /** When provided, opens the form in "customer" mode with this contact pre-selected. */
  initialContactId?: string;
}

const blankItem: LineItemDraft = { description: "", quantity: 1, unit_price: 0 };

function contactName(c: ContactListItem) {
  return c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || "(no name)";
}

interface ProposalTemplate {
  template_id: string;
  name: string;
  body: any;
  is_default?: boolean;
}

export function QuoteCreateForm({ onCreated, onCancel, initialJobId, initialContactId }: CreateQuoteProps) {
  const { get, post, ready } = useOliverApi();
  const [mode, setMode] = useState<"customer" | "job">(initialJobId ? "job" : "customer");
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedJobId, setSelectedJobId] = useState(initialJobId || "");
  const [selectedContactId, setSelectedContactId] = useState(initialContactId || "");
  const [items, setItems] = useState<LineItemDraft[]>([{ ...blankItem }]);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [coupons, setCoupons] = useState<CouponLite[]>([]);
  const [taxMode, setTaxMode] = useState<"percent" | "amount">("percent");
  const [taxRate, setTaxRate] = useState("");
  const [taxManual, setTaxManual] = useState("");
  const [invDisc, setInvDisc] = useState<Disc>({ ...NO_DISC });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // #77 — Proposal template picker (symmetric with New Proposal drawer).
  const [templates, setTemplates] = useState<ProposalTemplate[]>([]);
  const [templateId, setTemplateId] = useState("");

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        const [c, o, j1, j2, j3, cp, tpl] = await Promise.all([
          get<ContactListItem[]>("/contacts"),
          get<Offering[]>("/catalog/offerings?include_prices=1").catch(() => [] as Offering[]),
          get<JobListItem[]>("/jobs?status=inquiry&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=quoted&per_page=50").catch(() => [] as JobListItem[]),
          get<JobListItem[]>("/jobs?status=scheduled&per_page=50").catch(() => [] as JobListItem[]),
          get<CouponLite[]>("/coupons").catch(() => [] as CouponLite[]),
          get<ProposalTemplate[]>("/proposal-templates").catch(() => [] as ProposalTemplate[]),
        ]);
        setContacts(c || []);
        setOfferings(o || []);
        setJobs([...(j1 || []), ...(j2 || []), ...(j3 || [])]);
        setCoupons(cp || []);
        setTemplates(tpl || []);
      } catch (e) {
        setError(`Failed to load data: ${(e as Error).message}`);
      }
    })();
  }, [get, ready]);

  function applyTemplate(t: ProposalTemplate) {
    const b = t.body || {};
    if (Array.isArray(b.line_items) && b.line_items.length > 0) {
      setItems(b.line_items.map((it: any) => ({
        description: String(it?.description ?? ""),
        quantity: Number(it?.quantity ?? 1),
        unit_price: Number(it?.unit_price ?? 0),
      })));
    }
    if (typeof b.tax_rate === "number") {
      setTaxMode("percent");
      setTaxRate(String(b.tax_rate));
    }
    // Canonical body has `terms` (not `notes`); fall back to `scope`.
    const noteSource = typeof b.terms === "string" && b.terms
      ? b.terms
      : (typeof b.scope === "string" ? b.scope : "");
    if (noteSource) setNotes(noteSource);
    if (typeof b.valid_until_days === "number" && b.valid_until_days > 0) {
      const d = new Date();
      d.setDate(d.getDate() + b.valid_until_days);
      setValidUntil(d.toISOString().slice(0, 10));
    }
  }

  function onSelectTemplate(id: string) {
    setTemplateId(id);
    if (!id) return;
    const t = templates.find((x) => x.template_id === id);
    if (t) applyTemplate(t);
  }

  const totals = useMemo(() => {
    let gross = 0, lineDiscounts = 0;
    for (const it of items) {
      const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
      gross += lt;
      lineDiscounts += discountAmount(it.discount, lt, coupons);
    }
    const afterLine = Math.max(0, gross - lineDiscounts);
    const invDiscount = discountAmount(invDisc, afterLine, coupons);
    const taxable = Math.max(0, gross - lineDiscounts - invDiscount);
    const tax = taxMode === "amount"
      ? Math.max(0, Number(taxManual) || 0)
      : taxable * ((Number(taxRate) || 0) / 100);
    return { subtotal: gross, lineDiscounts, invDiscount, tax, total: taxable + tax };
  }, [items, invDisc, coupons, taxMode, taxRate, taxManual]);

  function updateItem(idx: number, patch: Partial<LineItemDraft>) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function addLine() { setItems((prev) => [...prev, { ...blankItem }]); }

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
        service_offering_id: off.offering_id,
        service_price_id: price?.price_id,
      },
    ]);
  }

  async function submit() {
    setError(null);
    if (mode === "job" && !selectedJobId) { setError("Pick a job first."); return; }
    if (mode === "customer" && !selectedContactId) { setError("Pick a customer first."); return; }
    const cleaned = items.filter((it) => it.description.trim() && Number(it.unit_price) >= 0);
    if (!cleaned.length) { setError("Add at least one line item."); return; }
    setSubmitting(true);
    try {
      const couponLabel = (d: Disc) => {
        if (d.mode === "coupon") { const c = coupons.find((x) => x.coupon_id === d.couponId); return c ? `Coupon ${c.code}` : "Coupon"; }
        return d.mode === "percent" ? `Discount (${Number(d.value)}%)` : "Discount";
      };
      const lineOut: LineItemDraft[] = [];
      for (const it of cleaned) {
        lineOut.push({ description: it.description, quantity: it.quantity, unit_price: it.unit_price, is_tax: false, service_offering_id: it.service_offering_id, service_price_id: it.service_price_id });
        const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
        const da = discountAmount(it.discount, lt, coupons);
        if (da > 0 && it.discount) lineOut.push({ description: `${couponLabel(it.discount)} — ${it.description}`, quantity: 1, unit_price: -Number(da.toFixed(2)), is_tax: false });
      }
      if (totals.invDiscount > 0) lineOut.push({ description: couponLabel(invDisc), quantity: 1, unit_price: -Number(totals.invDiscount.toFixed(2)), is_tax: false });
      if (totals.tax > 0) lineOut.push({ description: taxMode === "amount" ? "Sales Tax" : `Sales Tax (${Number(taxRate)}%)`, quantity: 1, unit_price: Number(totals.tax.toFixed(2)), is_tax: true });
      const body: Record<string, unknown> = {
        line_items: lineOut,
        valid_until: validUntil || null,
        notes: notes.trim() || null,
      };
      if (mode === "job") body.job_id = selectedJobId;
      else body.contact_id = selectedContactId;
      await post("/quotes", body);
      onCreated();
    } catch (e) {
      setError(`Create failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div className="card-ttl">New quote</div>
          <div className="card-sub">Itemized pricing the customer can accept; convert to an invoice.</div>
        </div>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: "#5A7A8A", cursor: "pointer", fontSize: 12 }}>Cancel</button>
      </div>

      {/* The Proposal tab is gone.
          It posted to /proposals with no title, which that endpoint requires,
          so every proposal saved from here answered 400 "title required" — and
          the form had no field to put one in. A proposal is not a quote with a
          different label either: it carries a narrative, terms, a tracked send
          and click-to-accept, none of which this form collects.
          The real editor lives on the Proposals page, which had no nav row
          until today and so could not be found. */}
      <div style={{ marginBottom: 12, padding: "8px 10px", borderRadius: 6, background: "#F4F8FA", border: "1px solid #E2ECF1", fontSize: 12, color: "#3A5A6A" }}>
        Writing a proposal instead?{" "}
        <a href="/app/services/oliver_proposals" style={{ color: "#0B6E8C", fontWeight: 600 }}>
          Open the proposal editor
        </a>{" "}
        — it adds a narrative, terms, tracked sending and click-to-accept.
      </div>

      {templates.length > 0 && (
        <Field label="Start from template (optional)" style={{ marginBottom: 12 }}>
          <select value={templateId} onChange={(e) => onSelectTemplate(e.target.value)} style={selectStyle}>
            <option value="">— No template —</option>
            {templates.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.name}{t.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      {error && (
        <div style={{
          background: "#FEE2E2", border: "1px solid #FECACA",
          color: "#991B1B", borderRadius: 6, padding: "8px 12px", fontSize: 12, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      <div className="ptabs" style={{ marginBottom: 12 }}>
        <button className={`ptab${mode === "customer" ? " active" : ""}`} onClick={() => setMode("customer")}>Quote a customer</button>
        <button className={`ptab${mode === "job" ? " active" : ""}`} onClick={() => setMode("job")}>From an existing job</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {mode === "customer" ? (
          <Field label="Customer">
            <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} style={selectStyle}>
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
            <select value={selectedJobId} onChange={(e) => setSelectedJobId(e.target.value)} style={selectStyle}>
              <option value="">— Pick a job —</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title || "(untitled)"} — {j.customerName} ({j.status})
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Valid until (optional)">
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} style={selectStyle} />
        </Field>
      </div>

      {offerings.length > 0 && (
        <Field label="Add from your service catalog (optional)">
          <select
            onChange={(e) => { if (e.target.value) { addPriceLine(e.target.value); e.target.value = ""; } }}
            style={selectStyle}
            defaultValue=""
          >
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
          <div>Description</div><div style={{ textAlign: "right" }}>Qty</div><div style={{ textAlign: "right" }}>Unit price</div><div style={{ textAlign: "right" }}>Amount</div><div />
        </div>
        <div style={{ border: "1px solid #eef2f4", borderRadius: 6 }}>
          {items.map((it, i) => {
            const lt = Number(it.quantity || 0) * Number(it.unit_price || 0);
            const ld = discountAmount(it.discount, lt, coupons);
            return (
            <div key={i} style={{ padding: "8px 10px", borderBottom: i < items.length - 1 ? "1px solid #f0f4f6" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 110px 92px 28px", gap: 8, alignItems: "center" }}>
                <input type="text" placeholder="Description" value={it.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })} style={inputStyle} />
                <input type="number" step="0.001" min="0" value={it.quantity}
                  onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} style={{ ...inputStyle, textAlign: "right" }} />
                <input type="number" step="0.01" min="0" value={it.unit_price}
                  onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} style={{ ...inputStyle, textAlign: "right" }} />
                <div style={{ textAlign: "right", fontSize: 12, fontFamily: "monospace", color: "#0B1C24" }}>${lt.toFixed(2)}</div>
                <button type="button" onClick={() => removeItem(i)} title="Remove"
                  style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 18, padding: 0 }}>×</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>Line discount</span>
                <DiscountPicker d={it.discount || NO_DISC} coupons={coupons} onChange={(d) => updateItem(i, { discount: d })} />
                {ld > 0 && <span style={{ fontSize: 11, color: "#059669" }}>−${ld.toFixed(2)}</span>}
              </div>
            </div>
          ); })}
        </div>
        <div style={{ marginTop: 8 }}>
          <button type="button" onClick={addLine} style={{ background: "none", border: "none", color: "#1A7DB5", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: 0 }}>+ Add line item</button>
        </div>
      </div>

      <Field label="Notes (optional)" style={{ marginTop: 12 }}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Terms, scope, exclusions…"
          style={{ ...selectStyle, fontFamily: "inherit", resize: "vertical" }}
        />
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <div style={{ width: 360, fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#5A7A8A" }}>
            <span>Subtotal</span><span style={{ fontFamily: "monospace", color: "#0B1C24" }}>${totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.lineDiscounts > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#059669" }}>
              <span>Line discounts</span><span style={{ fontFamily: "monospace" }}>−${totals.lineDiscounts.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0", gap: 8 }}>
            <span style={{ color: "#5A7A8A", whiteSpace: "nowrap" }}>Quote discount</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <DiscountPicker d={invDisc} coupons={coupons} onChange={setInvDisc} />
              <span style={{ width: 64, textAlign: "right", color: "#059669" }}>{totals.invDiscount > 0 ? `−$${totals.invDiscount.toFixed(2)}` : "—"}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0", gap: 8 }}>
            <span style={{ color: "#5A7A8A" }}>Sales tax</span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <select value={taxMode} onChange={(e) => setTaxMode(e.target.value as "percent" | "amount")} style={{ ...inputStyle, width: 76, padding: "4px 2px" }}>
                <option value="percent">Rate %</option><option value="amount">Manual $</option>
              </select>
              {taxMode === "percent"
                ? <input type="number" min="0" step="0.001" placeholder="0" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} style={{ ...inputStyle, width: 60, textAlign: "right" }} />
                : <input type="number" min="0" step="0.01" placeholder="0.00" value={taxManual} onChange={(e) => setTaxManual(e.target.value)} style={{ ...inputStyle, width: 60, textAlign: "right" }} />}
              <span style={{ width: 64, textAlign: "right", color: "#B45309" }}>{totals.tax > 0 ? `$${totals.tax.toFixed(2)}` : "—"}</span>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "1px solid #eef2f4", fontWeight: 600 }}>
            <span>Total</span><span style={{ fontFamily: "monospace", color: "#0B1C24" }}>${totals.total.toFixed(2)}</span>
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
          {submitting ? "Creating…" : "Create quote (draft)"}
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

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label style={{ display: "block", ...style }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#5A7A8A", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

function DiscountPicker({ d, coupons, onChange }: { d: Disc; coupons: CouponLite[]; onChange: (d: Disc) => void }) {
  const mini: React.CSSProperties = { padding: "4px 6px", fontSize: 11, border: "1px solid rgba(45,156,219,0.22)", borderRadius: 4, background: "#fff", color: "#0B1C24" };
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select value={d.mode} style={{ ...mini, width: 78 }} onChange={(e) => onChange({ ...d, mode: e.target.value as Disc["mode"] })}>
        <option value="none">None</option><option value="percent">% off</option><option value="amount">$ off</option>
        {coupons.length > 0 && <option value="coupon">Coupon</option>}
      </select>
      {(d.mode === "percent" || d.mode === "amount") && (
        <input type="number" min="0" step="0.01" placeholder={d.mode === "percent" ? "%" : "$"} value={d.value}
          onChange={(e) => onChange({ ...d, value: e.target.value })} style={{ ...mini, width: 56, textAlign: "right" }} />
      )}
      {d.mode === "coupon" && (
        <select value={d.couponId} style={{ ...mini, width: 150 }} onChange={(e) => onChange({ ...d, couponId: e.target.value })}>
          <option value="">— pick coupon —</option>
          {coupons.map((c) => <option key={c.coupon_id} value={c.coupon_id}>{c.code}{c.percent_off != null ? ` (${c.percent_off}%)` : c.amount_off != null ? ` ($${c.amount_off})` : ""}</option>)}
        </select>
      )}
    </span>
  );
}
